import { execFile } from 'node:child_process';
import { readFile, statfs } from 'node:fs/promises';
import os from 'node:os';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { asc, eq, gt, lt } from 'drizzle-orm';
import { commandSchema, type Account, type Health, type Mode, type Position, type Severity, type Strategy, type StrategyId, type StrategyState } from '../shared/domain.ts';
import { openDb } from '../shared/db.ts';
import { engineEnvSchema, parseEnv } from '../shared/env.ts';
import { atET, et } from '../shared/et.ts';
import { duration, money, qty } from '../shared/format.ts';
import { isOpenOrder } from '../shared/orders.ts';
import * as t from '../shared/schema.ts';
import { AlpacaBroker } from './alpaca-broker.ts';
import { clientOrderId, strategyPrefix, type Broker, type BrokerOrder, type Clock } from './broker.ts';
import { breachReason, evaluateLimits } from './limits.ts';
import { marketSession } from './market-session.ts';
import { SimBroker } from './sim-broker.ts';
import { decide } from './sma-cross.ts';
import { todayStats } from './stats.ts';
import { step, type Effect, type LifecycleInput } from './strategy-lifecycle.ts';

const TICK_MS = 5_000;
const ERROR_DEDUPE_MS = 60_000;
const PRUNE_EVERY_MS = 3_600_000;
const KEEP_SAMPLES_MS = 30 * 86_400_000;

const env = parseEnv(engineEnvSchema);
const mode: Mode = env.PITWALL_BROKER === 'alpaca' && env.PITWALL_LIVE ? 'live' : 'paper';
const broker: Broker =
  env.PITWALL_BROKER === 'alpaca'
    ? new AlpacaBroker({ keyId: env.ALPACA_KEY_ID, secretKey: env.ALPACA_SECRET_KEY, live: env.PITWALL_LIVE })
    : new SimBroker();
const limitConfig = { dailyLossPct: env.PITWALL_DAILY_LOSS_PCT, maxRejections: env.PITWALL_MAX_REJECTIONS, brokerSilenceS: env.PITWALL_BROKER_SILENCE_S };
const configured = env.PITWALL_STRATEGIES;
const strategyIds = new Map<string, StrategyId>(configured.map((s) => [s.id, s.id]));
const db = openDb(env.PITWALL_DB);

const saved = db.select().from(t.status).where(eq(t.status.id, 1)).get();
let states = new Map<StrategyId, StrategyState>(configured.map((s) => [s.id, saved?.strategies.find((p) => p.id === s.id)?.state ?? { kind: 'running' }]));
let commandCursor = saved?.commandCursor ?? 0;
let lastBrokerOkAt = new Date();
let consecutiveRejections = 0;
let latest: { account: Account; positions: Position[]; clock: Clock; orders: BrokerOrder[] } | null = null;
let lastPruneAt = 0;
let lastTickAt = Date.now();
const recentErrors = new Map<string, number>();

const message = (err: unknown) => {
  if (err instanceof Error && err.name === 'TimeoutError') return 'no reply within 10s.';
  return err instanceof Error ? err.message : String(err);
};
const strategyOf = (o: BrokerOrder) => strategyIds.get(strategyPrefix(o.clientOrderId)) ?? null;

function logEvent(severity: Severity, text: string, source: string) {
  db.insert(t.events).values({ at: new Date().toISOString(), severity, message: text, source }).run();
  if (env.NTFY_URL && (severity === 'halt' || severity === 'error')) {
    fetch(env.NTFY_URL, { method: 'POST', body: text, headers: { Title: `Pitwall ${mode.toUpperCase()}` }, signal: AbortSignal.timeout(5_000) }).catch(() => {});
  }
}

function logError(text: string, source: string) {
  const now = Date.now();
  for (const [m, at] of recentErrors) if (now - at >= ERROR_DEDUPE_MS) recentErrors.delete(m);
  if (recentErrors.has(text)) return;
  recentErrors.set(text, now);
  logEvent('error', text, source);
}

async function runEffect(effect: Effect) {
  if (effect.type === 'event') return logEvent(effect.severity, effect.message, effect.source);
  try {
    if (effect.type === 'cancel-open-orders') await broker.cancelOpenOrders(effect.strategyId);
    else await broker.closeAllPositions();
  } catch (err) {
    logError(`${effect.type === 'cancel-open-orders' ? 'Cancel open orders' : 'Close all positions'} failed: ${message(err)}`, 'broker');
  }
}

async function apply(input: LifecycleInput, now: string) {
  const result = step(states, input, now);
  states = result.states;
  for (const effect of result.effects) await runEffect(effect);
}

function saveOrders(orders: BrokerOrder[]) {
  db.transaction((tx) => {
    for (const o of orders) {
      tx.insert(t.orders)
        .values({ ...o, strategyId: strategyOf(o) })
        .onConflictDoUpdate({ target: t.orders.id, set: { status: o.status, filledQty: o.filledQty, filledAvgPrice: o.filledAvgPrice, updatedAt: o.updatedAt } })
        .run();
    }
  });
}

const execFileAsync = promisify(execFile);

async function piHealth(): Promise<Omit<Health, 'brokerConnected'>> {
  const [cpuTempC, throttled, diskUsedPct] = await Promise.all([
    readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8').then((s) => Number(s) / 1000, () => null),
    // The low four bits of get_throttled are "happening now"; higher bits are history since boot.
    execFileAsync('vcgencmd', ['get_throttled'], { timeout: 2_000 }).then(({ stdout }) => (Number(stdout.trim().split('=')[1]) & 0xf) !== 0, () => null),
    statfs(dirname(env.PITWALL_DB)).then((s) => ((s.blocks - s.bfree) / (s.blocks - s.bfree + s.bavail)) * 100, () => null),
  ]);
  return { cpuTempC, throttled, diskUsedPct, memUsedBytes: os.totalmem() - os.freemem(), memTotalBytes: os.totalmem(), uptimeS: os.uptime() };
}

async function runStrategies(now: Date, view: NonNullable<typeof latest>) {
  for (const s of configured) {
    if (states.get(s.id)?.kind !== 'running') continue;
    if (view.orders.some((o) => strategyOf(o) === s.id && isOpenOrder(o))) continue;
    try {
      const decision = decide(await broker.getBars(s.symbol, 31), view.positions.find((p) => p.symbol === s.symbol)?.qty ?? 0);
      if (!decision) continue;
      const order = await broker.submitOrder({ symbol: s.symbol, ...decision, clientOrderId: clientOrderId(s.id, now) });
      saveOrders([order]);
      const what = `${decision.side === 'buy' ? 'Buy' : 'Sell'} ${qty(decision.qty)} ${s.symbol}`;
      if (order.status === 'rejected') {
        consecutiveRejections++;
        logEvent('warn', `${what} rejected by broker.`, s.id);
      } else {
        consecutiveRejections = 0;
        logEvent('info', order.filledAvgPrice === null ? `${what} ${order.status}.` : `${what} filled at ${money(order.filledAvgPrice)}.`, s.id);
      }
    } catch (err) {
      logError(`${s.id}: ${message(err)}`, s.id);
    }
  }
}

async function tick() {
  const now = new Date();
  const iso = now.toISOString();
  // A gap far past the tick interval means this process was suspended (laptop
  // sleep, SIGSTOP). Broker silence is measured from here so the engine's own
  // absence never reads as a broker outage.
  const gapMs = now.getTime() - lastTickAt;
  lastTickAt = now.getTime();
  if (gapMs > TICK_MS * 3) {
    lastBrokerOkAt = now;
    logEvent('info', `Engine resumed after a ${duration(gapMs / 1000)} pause.`, 'engine');
  }

  const pending = db.select().from(t.commands).where(gt(t.commands.id, commandCursor)).orderBy(asc(t.commands.id)).all();
  for (const row of pending) {
    const parsed = commandSchema.safeParse({ kind: row.kind, strategyId: row.strategyId ?? undefined });
    if (!parsed.success) logEvent('warn', `Ignored malformed command ${row.id}.`, 'engine');
    else {
      if (parsed.data.kind === 'resume-strategy') consecutiveRejections = 0;
      await apply({ type: 'command', command: parsed.data }, iso);
    }
    commandCursor = row.id;
  }

  let brokerConnected = false;
  try {
    const [account, positions, clock, orders] = await Promise.all([
      broker.getAccount(),
      broker.getPositions(),
      broker.getClock(),
      broker.listOrdersSince(atET(now, '00:00')),
    ]);
    latest = { account, positions, clock, orders };
    lastBrokerOkAt = now;
    brokerConnected = true;
    saveOrders(orders);
  } catch (err) {
    logError(`Broker: ${message(err)}`, 'broker');
  }

  const account = latest?.account ?? { equity: 0, lastEquity: 0, buyingPower: 0, cash: 0 };
  const limits = evaluateLimits({ account, consecutiveRejections, lastBrokerOkAt, now }, limitConfig);
  for (const l of limits) if (l.breached) await apply({ type: 'limit-breached', limit: l.id, reason: breachReason(l) }, iso);

  const market = latest ? marketSession(latest.clock, now) : { state: 'closed' as const, nextChangeAt: iso };
  if (latest && brokerConnected && market.state === 'open') await runStrategies(now, latest);

  const positions = latest?.positions ?? [];
  const strategies: Strategy[] = configured.map((s) => {
    const position = positions.find((p) => p.symbol === s.symbol);
    const mine = latest?.orders.filter((o) => strategyOf(o) === s.id) ?? [];
    return { id: s.id, symbol: s.symbol, state: states.get(s.id) ?? { kind: 'running' }, positions: position ? 1 : 0, ...todayStats(mine, position?.lastPrice) };
  });
  const health: Health = { brokerConnected, ...(await piHealth()) };

  const row = { mode, heartbeatAt: iso, commandCursor, account, market, positions, strategies, limits, health };
  db.insert(t.status).values({ id: 1, ...row }).onConflictDoUpdate({ target: t.status.id, set: row }).run();

  if (brokerConnected) {
    db.insert(t.equitySamples).values({ at: iso, equity: account.equity }).onConflictDoNothing().run();
    db.insert(t.dailyEquity).values({ date: et(now).date, equity: account.equity }).onConflictDoUpdate({ target: t.dailyEquity.date, set: { equity: account.equity } }).run();
  }
  if (now.getTime() - lastPruneAt >= PRUNE_EVERY_MS) {
    db.delete(t.equitySamples).where(lt(t.equitySamples.at, new Date(now.getTime() - KEEP_SAMPLES_MS).toISOString())).run();
    lastPruneAt = now.getTime();
  }
}

let stopping = false;
let ticking = false;
let timer: NodeJS.Timeout | undefined;

function exit() {
  db.$client.close();
  process.exit(0);
}

async function loop() {
  const started = Date.now();
  ticking = true;
  try {
    await tick();
  } catch (err) {
    logError(`Engine tick failed: ${message(err)}`, 'engine');
  }
  ticking = false;
  if (stopping) return exit();
  timer = setTimeout(loop, Math.max(0, TICK_MS - (Date.now() - started)));
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    stopping = true;
    if (ticking) return;
    clearTimeout(timer);
    exit();
  });
}

logEvent('info', `Engine started. ${mode.toUpperCase()} on ${env.PITWALL_BROKER}, strategies ${configured.map((s) => s.id).join(', ')}.`, 'engine');
void loop();
