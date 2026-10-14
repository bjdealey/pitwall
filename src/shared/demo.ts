import { evaluateLimits } from '../engine/limits.ts';
import type { Command, EventRecord, Order, Position, Snapshot, Strategy, StrategyId } from './domain.ts';
import { atET } from './et.ts';
import { money, qty } from './format.ts';

const S = 1_000;
const MIN = 60 * S;
const GB = 1024 ** 3;
const LIMITS = { dailyLossPct: 2, maxRejections: 3, brokerSilenceS: 30 };

const id = (s: string) => s as StrategyId;

/** Sample data for the demo build and the design system: a paper account four hours into the session. */
export function demoSnapshot(now: Date): Snapshot {
  const t = now.getTime();
  const ago = (ms: number) => new Date(t - ms).toISOString();
  const open = t - 4 * 60 * MIN;
  const equityToday = Array.from({ length: 49 }, (_, i) => ({
    at: new Date(open + i * 5 * MIN).toISOString(),
    equity: Math.round((100_000 + 9 * i + 140 * Math.sin(i / 4) + 45 * Math.sin(i / 1.7)) * 100) / 100,
  }));
  const account = { equity: equityToday[equityToday.length - 1]?.equity ?? 100_000, lastEquity: 100_000, buyingPower: 197_412.36, cash: 92_317.52 };
  const spy: Strategy = { id: id('sma-cross-spy'), symbol: 'SPY', state: { kind: 'running' }, todayPl: 291.4, positions: 1, fillsToday: 4 };
  const qqq: Strategy = { id: id('sma-cross-qqq'), symbol: 'QQQ', state: { kind: 'running' }, todayPl: -41.16, positions: 1, fillsToday: 2 };
  const order = (o: Partial<Order> & Pick<Order, 'id' | 'symbol' | 'side' | 'qty' | 'status' | 'submittedAt'>): Order => ({ strategyId: null, type: 'market', filledQty: 0, filledAvgPrice: null, ...o });
  const event = (eventId: number, msAgo: number, severity: EventRecord['severity'], message: string, source: string): EventRecord => ({ id: eventId, at: ago(msAgo), severity, message, source });
  const snapshot: Snapshot = {
    serverTime: now.toISOString(),
    mode: 'paper',
    heartbeatAt: ago(2 * S),
    market: { state: 'open', nextChangeAt: atET(now, '16:00') },
    account,
    equityToday,
    positions: [
      { symbol: 'SPY', qty: 12, avgEntryPrice: 571.2, lastPrice: 575.08, unrealizedPl: 46.56, unrealizedPlPct: 0.68 },
      { symbol: 'QQQ', qty: 8, avgEntryPrice: 498.1, lastPrice: 496.92, unrealizedPl: -9.44, unrealizedPlPct: -0.24 },
    ],
    orders: [
      order({ id: 'o6', strategyId: spy.id, symbol: 'SPY', side: 'sell', qty: 12, type: 'limit', status: 'new', submittedAt: ago(4_196 * S) }),
      order({ id: 'o5', strategyId: qqq.id, symbol: 'QQQ', side: 'sell', qty: 8, status: 'canceled', submittedAt: ago(8_882 * S) }),
      order({ id: 'o4', strategyId: spy.id, symbol: 'SPY', side: 'buy', qty: 12, status: 'filled', filledQty: 12, filledAvgPrice: 571.2, submittedAt: ago(10_133 * S) }),
      order({ id: 'o3', strategyId: id('sma-cross-iwm'), symbol: 'IWM', side: 'buy', qty: 20, status: 'rejected', submittedAt: ago(11_841 * S) }),
      order({ id: 'o2', strategyId: qqq.id, symbol: 'QQQ', side: 'buy', qty: 8, status: 'filled', filledQty: 8, filledAvgPrice: 498.1, submittedAt: ago(13_059 * S) }),
      order({ id: 'o1', symbol: 'IWM', side: 'sell', qty: 5, status: 'filled', filledQty: 5, filledAvgPrice: 221.4, submittedAt: ago(14_338 * S) }),
    ],
    strategies: [spy, qqq],
    limits: [],
    health: { brokerConnected: true, cpuTempC: 54.2, throttled: false, diskUsedPct: 31.4, memUsedBytes: 2.3 * GB, memTotalBytes: 8 * GB, uptimeS: 12 * 86_400 + 3 * 3_600 },
    events: [
      event(10, 1_890 * S, 'error', 'Account refresh failed: no reply within 10s.', 'broker'),
      event(9, 2_270 * S, 'error', 'Account refresh failed: no reply within 10s.', 'broker'),
      event(8, 2_575 * S, 'error', 'Account refresh failed: no reply within 10s.', 'broker'),
      event(7, 8_869 * S, 'info', 'Paused sma-cross-qqq from dashboard.', 'you'),
      event(6, 10_133 * S, 'info', 'Buy 12 SPY filled at $571.20.', 'sma-cross-spy'),
      event(5, 11_840 * S, 'halt', 'Rejection limit reached (3 of 3 orders in a row). Halted sma-cross-iwm.', 'engine'),
      event(4, 11_841 * S, 'warn', 'Buy 20 IWM rejected by broker.', 'sma-cross-iwm'),
      event(3, 13_059 * S, 'info', 'Buy 8 QQQ filled at $498.10.', 'sma-cross-qqq'),
      event(2, 14_700 * S, 'info', 'Engine started. PAPER on alpaca, strategies sma-cross-spy, sma-cross-qqq, sma-cross-iwm.', 'engine'),
    ],
  };
  snapshot.limits = evaluateLimits({ account, consecutiveRejections: 0, lastBrokerOkAt: new Date(t - 2 * S), now }, LIMITS);
  return snapshot;
}

/**
 * The demo's stand-in for the engine. Commands queue like rows in the commands table and apply on the next
 * 5-second tick; prices drift on a seeded walk; each strategy's P&L is what it banked plus its open position, and
 * `unattributed` is the day's P&L from trades no current strategy owns (the sample's manual and halted IWM trades).
 */
export type DemoState = { snapshot: Snapshot; queue: Command[]; banked: Record<string, number>; unattributed: number; seed: number };

const cents = (n: number) => Math.round(n * 100) / 100;

export type DemoResult = { ok: true } | { ok: false; error: string };

export function startDemo(now: Date, seed = 1): DemoState {
  const snapshot = demoSnapshot(now);
  const unrealized = (symbol: string) => snapshot.positions.find((p) => p.symbol === symbol)?.unrealizedPl ?? 0;
  const banked = Object.fromEntries(snapshot.strategies.map((s) => [s.id, s.todayPl - unrealized(s.symbol)]));
  const { equity, lastEquity } = snapshot.account;
  const unattributed = cents(equity - lastEquity - snapshot.strategies.reduce((sum, s) => sum + s.todayPl, 0));
  return { snapshot, queue: [], banked, unattributed, seed };
}

export function demoCommand(state: DemoState, command: Command, passcode?: string): { state: DemoState; result: DemoResult } {
  if (command.kind === 'flatten' && !passcode) return { state, result: { ok: false, error: 'Enter the passcode.' } };
  return { state: { ...state, queue: [...state.queue, command] }, result: { ok: true } };
}

// mulberry32: a tiny seeded PRNG, so a given seed always walks the same way.
function next(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(s ^ (s >>> 15), 1 | s);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4_294_967_296, s];
}

export function demoTick(state: DemoState, now: Date): DemoState {
  const iso = now.toISOString();
  let { seed } = state;
  let strategies = state.snapshot.strategies;
  let positions = state.snapshot.positions;
  let orders = state.snapshot.orders;
  const banked = { ...state.banked };
  const events = [...state.snapshot.events];
  const log = (severity: EventRecord['severity'], message: string, source: string) => events.unshift({ id: (events[0]?.id ?? 0) + 1, at: iso, severity, message, source });
  const set = (match: (s: Strategy) => boolean, kind: 'running' | 'paused') =>
    (strategies = strategies.map((s) => (match(s) ? { ...s, state: kind === 'running' ? { kind } : { kind, by: 'you' as const, at: iso } } : s)));

  for (const c of state.queue) {
    if (c.kind === 'pause-strategy') {
      set((s) => s.id === c.strategyId && s.state.kind === 'running', 'paused');
      log('info', `Paused ${c.strategyId} from dashboard.`, 'you');
    } else if (c.kind === 'resume-strategy') {
      set((s) => s.id === c.strategyId && s.state.kind !== 'running', 'running');
      log('info', `Resumed ${c.strategyId} from dashboard.`, 'you');
    } else {
      set((s) => s.state.kind === 'running', 'paused');
      if (c.kind === 'pause-all') log('info', 'Pause all from dashboard.', 'you');
      else {
        log('warn', 'Flatten from dashboard. Closing all positions.', 'you');
        for (const p of positions) {
          const owner = strategies.find((s) => s.symbol === p.symbol);
          if (owner) banked[owner.id] = (banked[owner.id] ?? 0) + p.unrealizedPl;
          orders = [{ id: `demo-${iso}-${p.symbol}`, strategyId: owner?.id ?? null, symbol: p.symbol, side: 'sell', qty: p.qty, type: 'market', status: 'filled', filledQty: p.qty, filledAvgPrice: p.lastPrice, submittedAt: iso }, ...orders];
          log('info', `Sell ${qty(p.qty)} ${p.symbol} filled at ${money(p.lastPrice)}.`, owner?.id ?? 'you');
        }
        positions = [];
      }
    }
  }

  positions = positions.map((p): Position => {
    const [r, s] = next(seed);
    seed = s;
    const lastPrice = cents(p.lastPrice * (1 + (r - 0.5) * 0.002));
    const unrealizedPl = cents((lastPrice - p.avgEntryPrice) * p.qty);
    return { ...p, lastPrice, unrealizedPl, unrealizedPlPct: cents(((lastPrice - p.avgEntryPrice) / p.avgEntryPrice) * 100) };
  });
  strategies = strategies.map((s) => {
    const held = positions.find((p) => p.symbol === s.symbol);
    return { ...s, positions: held ? 1 : 0, todayPl: cents((banked[s.id] ?? 0) + (held?.unrealizedPl ?? 0)) };
  });

  const { lastEquity } = state.snapshot.account;
  const account = { ...state.snapshot.account, equity: cents(lastEquity + state.unattributed + strategies.reduce((sum, s) => sum + s.todayPl, 0)) };
  const minute = iso.slice(0, 16);
  const trace = state.snapshot.equityToday;
  const equityToday = trace[trace.length - 1]?.at.slice(0, 16) === minute ? [...trace.slice(0, -1), { at: iso, equity: account.equity }] : [...trace, { at: iso, equity: account.equity }];
  const health = { ...state.snapshot.health, uptimeS: state.snapshot.health.uptimeS + 5 };

  return {
    snapshot: {
      ...state.snapshot,
      serverTime: iso,
      heartbeatAt: iso,
      account,
      equityToday,
      positions,
      orders,
      strategies,
      limits: evaluateLimits({ account, consecutiveRejections: 0, lastBrokerOkAt: now, now }, LIMITS),
      health,
      events: events.slice(0, 200),
    },
    queue: [],
    banked,
    unattributed: state.unattributed,
    seed,
  };
}
