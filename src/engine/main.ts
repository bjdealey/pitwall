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
import { clientOrderId, strategyPrefix, type Broker, type BrokerOrder, type Clock, type OrderRequest } from './broker.ts';
import { breachReason, evaluateLimits, tradesLimit } from './limits.ts';
import { marketSession } from './market-session.ts';
import { entriesToday, gateEntry, lastFillAt, riskExit, type ExitReason } from './rules.ts';
import { SimBroker } from './sim-broker.ts';
import { decide } from './sma-cross.ts';
import { todayStats } from './stats.ts';
import { step, type Effect, type LifecycleInput } from './strategy-lifecycle.ts';

const TICK_MS = 5_000;
const LOG_DEDUPE_MS = 60_000;
const EXIT_RETRY_MS = 60_000;
const PRUNE_EVERY_MS = 3_600_000;
const KEEP_SAMPLES_MS = 30 * 86_400_000;
// A refused exit leaves the position open, so it logs at error: ntfy fires only on error and halt.
const EXIT_LOG: Record<ExitReason, { prefix: string; severity: Severity; refused: Severity }> = {
  stop: { prefix: 'Stop hit: ', severity: 'warn', refused: 'error' },
  'flat-by': { prefix: 'Flat by close: ', severity: 'info', refused: 'error' },
};

const env = parseEnv(engineEnvSchema);
const mode: Mode = env.PITWALL_BROKER === 'alpaca' && env.PITWALL_LIVE ? 'live' : 'paper';
const broker: Broker =
  env.PITWALL_BROKER === 'alpaca'
    ? new AlpacaBroker({ keyId: env.ALPACA_KEY_ID, secretKey: env.ALPACA_SECRET_KEY, live: env.PITWALL_LIVE })
    : new SimBroker();
const limitConfig = { dailyLossPct: env.PITWALL_DAILY_LOSS_PCT, maxRejections: env.PITWALL_MAX_REJECTIONS, brokerSilenceS: env.PITWALL_BROKER_SILENCE_S };
const ruleConfig = {
  entryDelayMin: env.PITWALL_ENTRY_DELAY_MIN,
  entryCutoffMin: env.PITWALL_ENTRY_CUTOFF_MIN,
  flatBeforeCloseMin: env.PITWALL_FLAT_BEFORE_CLOSE_MIN,
  stopPct: env.PITWALL_STOP_PCT,
  riskPct: env.PITWALL_RISK_PCT,
  maxPositionPct: env.PITWALL_MAX_POSITION_PCT,
  cashBufferPct: env.PITWALL_CASH_BUFFER_PCT,
  maxTradesPerDay: env.PITWALL_MAX_TRADES_PER_DAY,
};
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
const recentLogs = new Map<string, number>();
const exitAttemptAt = new Map<StrategyId, number>();

const message = (err: unknown) => {
  if (err instanceof Error && err.name === 'TimeoutError') return 'no reply within 10s.';
  return err instanceof Error ? err.message : String(err);
};
const strategyOf = (o: BrokerOrder) => strategyIds.get(strategyPrefix(o.clientOrderId)) ?? null;
const ownEntries = (orders: BrokerOrder[]) => entriesToday(orders.filter((o) => strategyOf(o) !== null));

function logEvent(severity: Severity, text: string, source: string) {
  db.insert(t.events).values({ at: new Date().toISOString(), severity, message: text, source }).run();
  if (env.NTFY_URL && (severity === 'halt' || severity === 'error')) {
    fetch(env.NTFY_URL, { method: 'POST', body: text, headers: { Title: `Pitwall ${mode.toUpperCase()}` }, signal: AbortSignal.timeout(5_000) }).catch(() => {});
  }
}

function logOnce(severity: Severity, text: string, source: string) {
  const now = Date.now();
  for (const [m, at] of recentLogs) if (now - at >= LOG_DEDUPE_MS) recentLogs.delete(m);
  if (recentLogs.has(text)) return;
  recentLogs.set(text, now);
  logEvent(severity, text, source);
}

function logError(text: string, source: string) {
  logOnce('error', text, source);
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

async function submit(strategyId: StrategyId, request: Omit<OrderRequest, 'clientOrderId'>, now: Date, { prefix = '', severity = 'info', refused = 'warn' }: { prefix?: string; severity?: Severity; refused?: Severity } = {}) {
  const order = await broker.submitOrder({ ...request, clientOrderId: clientOrderId(strategyId, now) });
  saveOrders([order]);
  const what = `${prefix}${request.side === 'buy' ? 'Buy' : 'Sell'} ${qty(request.qty)} ${request.symbol}`;
  if (order.status === 'rejected') {
    consecutiveRejections++;
    logEvent(refused, `${what} rejected by broker.`, strategyId);
  } else {
    consecutiveRejections = 0;
    logEvent(severity, order.filledAvgPrice === null ? `${what} ${order.status}.` : `${what} filled at ${money(order.filledAvgPrice)}.`, strategyId);
  }
  return order;
}

async function runStrategies(now: Date, view: NonNullable<typeof latest>) {
  let cashLeft = view.account.cash;
  let entries = ownEntries(view.orders);
  for (const s of configured) {
    const state = states.get(s.id);
    const mine = view.orders.filter((o) => strategyOf(o) === s.id);
    if (!state || mine.some(isOpenOrder)) continue;
    try {
      const position = view.positions.find((p) => p.symbol === s.symbol);
      const exit = riskExit(state, position, view.clock, now, ruleConfig);
      if (exit && position) {
        // A halt ends the rejection limit's stop on attempts, so this paces a refused exit. A throw skips the set and retries next tick.
        if (now.getTime() - (exitAttemptAt.get(s.id) ?? 0) >= EXIT_RETRY_MS) {
          await submit(s.id, { symbol: s.symbol, side: 'sell', qty: position.qty }, now, EXIT_LOG[exit]);
          exitAttemptAt.set(s.id, now.getTime());
        }
        continue;
      }
      if (state.kind !== 'running') continue;

      const closes = await broker.getBars(s.symbol, 31);
      const decision = decide(closes, position?.qty ?? 0);
      if (!decision) continue;
      if (decision.side === 'sell') {
        await submit(s.id, { symbol: s.symbol, ...decision }, now);
        continue;
      }
      const price = closes.at(-1) ?? 0;
      const verdict = gateEntry({ clock: view.clock, now, entriesToday: entries, lastFillAt: lastFillAt(mine), price, equity: view.account.equity, cash: cashLeft, ceiling: decision.qty }, ruleConfig);
      if ('blocked' in verdict) {
        logOnce('info', `Buy ${s.symbol} skipped: ${verdict.blocked}.`, s.id);
        continue;
      }
      const order = await submit(s.id, { symbol: s.symbol, side: 'buy', qty: verdict.qty }, now);
      if (order.status !== 'rejected') {
        cashLeft -= verdict.qty * price;
        entries++;
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
  const haltLimits = evaluateLimits({ account, consecutiveRejections, lastBrokerOkAt, now }, limitConfig);
  for (const l of haltLimits) if (l.breached) await apply({ type: 'limit-breached', limit: l.id, reason: breachReason(l) }, iso);

  const market = latest ? marketSession(latest.clock, now) : { state: 'closed' as const, nextChangeAt: iso };
  if (latest && brokerConnected && market.state === 'open') await runStrategies(now, latest);

  const positions = latest?.positions ?? [];
  const strategies: Strategy[] = configured.map((s) => {
    const position = positions.find((p) => p.symbol === s.symbol);
    const mine = latest?.orders.filter((o) => strategyOf(o) === s.id) ?? [];
    return { id: s.id, symbol: s.symbol, state: states.get(s.id) ?? { kind: 'running' }, positions: position ? 1 : 0, ...todayStats(mine, position?.lastPrice) };
  });
  const health: Health = { brokerConnected, ...(await piHealth()) };

  const row = { mode, heartbeatAt: iso, commandCursor, account, market, positions, strategies, limits: [...haltLimits, tradesLimit(ownEntries(latest?.orders ?? []), env.PITWALL_MAX_TRADES_PER_DAY)], health };
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
