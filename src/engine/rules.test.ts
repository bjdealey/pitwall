import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Position, StrategyState } from '../shared/domain.ts';
import type { BrokerOrder, Clock } from './broker.ts';
import { entriesToday, gateEntry, lastFillAt, riskExit, type EntryInput, type EntryVerdict, type RuleConfig } from './rules.ts';

const config: RuleConfig = { entryDelayMin: 31, entryCutoffMin: 30, flatBeforeCloseMin: 5, stopPct: 1, riskPct: 1, maxPositionPct: 75, cashBufferPct: 10, maxTradesPerDay: 3 };
const clock: Clock = { isOpen: true, sessionOpen: '2026-10-12T13:30:00.000Z', nextOpen: '2026-10-13T13:30:00.000Z', nextClose: '2026-10-12T20:00:00.000Z' };
const earlyClose: Clock = { ...clock, nextClose: '2026-10-12T17:00:00.000Z' };
const at = (time: string) => new Date(`2026-10-12T${time}Z`);
const midday = at('16:00:00');
const flatBy = at('19:55:00');

const running: StrategyState = { kind: 'running' };
const paused: StrategyState = { kind: 'paused', by: 'you', at: '2026-10-12T14:00:00.000Z' };
const halted: StrategyState = { kind: 'halted', reason: 'Daily loss limit reached.', at: '2026-10-12T14:00:00.000Z' };
const holding = (lastPrice: number, qty = 10): Position => ({ symbol: 'SPY', qty, avgEntryPrice: 500, lastPrice, unrealizedPl: 0, unrealizedPlPct: 0 });
const STOP_LEVEL = 495;

test('the stop fires at exactly the stop level and not a cent above', () => {
  assert.equal(riskExit(running, holding(STOP_LEVEL), clock, midday, config), 'stop');
  assert.equal(riskExit(running, holding(STOP_LEVEL + 0.01), clock, midday, config), null);
});

test('flat-by fires at exactly nextClose minus the margin and not a second before', () => {
  assert.equal(riskExit(running, holding(500), clock, flatBy, config), 'flat-by');
  assert.equal(riskExit(running, holding(500), clock, at('19:54:59'), config), null);
});

test('an early close moves flat-by with it', () => {
  assert.equal(riskExit(running, holding(500), earlyClose, at('16:55:00'), config), 'flat-by');
  assert.equal(riskExit(running, holding(500), earlyClose, at('16:54:59'), config), null);
});

test('a paused strategy keeps its position even with both conditions true', () => {
  assert.equal(riskExit(paused, holding(STOP_LEVEL), clock, flatBy, config), null);
});

test('a halted strategy still takes its stop and flat-by', () => {
  assert.equal(riskExit(halted, holding(STOP_LEVEL), clock, midday, config), 'stop');
  assert.equal(riskExit(halted, holding(500), clock, flatBy, config), 'flat-by');
});

test('nothing to close means no exit even with both conditions true', () => {
  assert.equal(riskExit(running, undefined, clock, flatBy, config), null);
  assert.equal(riskExit(running, holding(STOP_LEVEL, 0), clock, flatBy, config), null);
  assert.equal(riskExit(running, holding(STOP_LEVEL, -10), clock, flatBy, config), null);
});

test('a last price of 0 is no stop, and flat-by still fires', () => {
  assert.equal(riskExit(running, holding(0), clock, midday, config), null);
  assert.equal(riskExit(running, holding(0), clock, flatBy, config), 'flat-by');
});

test('the stop wins when both conditions are true', () => {
  assert.equal(riskExit(running, holding(STOP_LEVEL), clock, flatBy, config), 'stop');
});

const entry = (over: Partial<EntryInput> = {}): EntryInput => ({ clock, now: midday, entriesToday: 0, lastFillAt: null, price: 600, equity: 50_000, cash: 50_000, ceiling: 1000, ...over });
const SIZE = { qty: 62 };
const isBlocked = (verdict: EntryVerdict) => 'blocked' in verdict;

test('entries open exactly at sessionOpen plus the delay', () => {
  assert.deepEqual(gateEntry(entry({ now: at('14:01:00') }), config), SIZE);
  assert.ok(isBlocked(gateEntry(entry({ now: at('14:00:59') }), config)));
});

test('entries close exactly at nextClose minus the cutoff', () => {
  assert.deepEqual(gateEntry(entry({ now: at('19:29:59') }), config), SIZE);
  assert.ok(isBlocked(gateEntry(entry({ now: at('19:30:00') }), config)));
});

test('an early close moves the cutoff with it', () => {
  assert.deepEqual(gateEntry(entry({ clock: earlyClose, now: at('16:29:59') }), config), SIZE);
  assert.ok(isBlocked(gateEntry(entry({ clock: earlyClose, now: at('16:30:00') }), config)));
});

test('a flat-by margin larger than the cutoff closes entries first, so no buy lands while flat-by sells', () => {
  const late = { ...config, flatBeforeCloseMin: 45 };
  assert.deepEqual(gateEntry(entry({ now: at('19:14:59') }), late), SIZE);
  assert.ok(isBlocked(gateEntry(entry({ now: at('19:15:00') }), late)));
});

test('the trade cap passes under the max and blocks at it', () => {
  assert.deepEqual(gateEntry(entry({ entriesToday: 2 }), config), SIZE);
  const verdict = gateEntry(entry({ entriesToday: 3 }), config);
  assert.ok('blocked' in verdict);
  assert.match(verdict.blocked, /3 of 3 trades today/);
});

test('a fill under 60 seconds ago blocks the entry, and 60 seconds or none passes', () => {
  assert.ok(isBlocked(gateEntry(entry({ lastFillAt: at('15:59:01').toISOString() }), config)));
  assert.deepEqual(gateEntry(entry({ lastFillAt: at('15:59:00').toISOString() }), config), SIZE);
  assert.deepEqual(gateEntry(entry({ lastFillAt: null }), config), SIZE);
});

test('blocked text stays identical over time so the log can dedupe on it', () => {
  const cases: Partial<EntryInput>[] = [{ now: at('14:00:00') }, { now: at('19:40:00') }, { entriesToday: 3 }, { lastFillAt: midday.toISOString() }, { price: 0 }];
  for (const c of cases) {
    const first = gateEntry(entry(c), config);
    const later = gateEntry(entry({ ...c, now: new Date((c.now ?? midday).getTime() + 10_000) }), config);
    assert.ok(isBlocked(first), `${JSON.stringify(c)} is blocked`);
    assert.deepEqual(later, first);
  }
});

test('the first failing check gives the reason', () => {
  const windowClosed = gateEntry(entry({ now: at('14:00:00') }), config);
  assert.deepEqual(gateEntry(entry({ now: at('14:00:00'), entriesToday: 3, lastFillAt: at('13:59:59').toISOString(), price: 0 }), config), windowClosed);
  const capHit = gateEntry(entry({ entriesToday: 3 }), config);
  assert.deepEqual(gateEntry(entry({ entriesToday: 3, lastFillAt: midday.toISOString(), price: 0 }), config), capHit);
  const cooling = gateEntry(entry({ lastFillAt: midday.toISOString() }), config);
  assert.deepEqual(gateEntry(entry({ lastFillAt: midday.toISOString(), price: 0 }), config), cooling);
  assert.notDeepEqual(windowClosed, capHit);
  assert.notDeepEqual(capHit, cooling);
});

test('the ceiling holds however large the account is', () => {
  assert.deepEqual(gateEntry(entry({ equity: 1e9, cash: 1e9, ceiling: 10 }), config), { qty: 10 });
});

test('the position cap decides when it is the smallest', () => {
  assert.deepEqual(gateEntry(entry(), config), { qty: 62 });
});

test('the risk budget decides when it is the smallest', () => {
  assert.deepEqual(gateEntry(entry(), { ...config, riskPct: 0.1 }), { qty: 8 });
});

test('the cash left above the buffer decides when it is the smallest', () => {
  assert.deepEqual(gateEntry(entry({ cash: 6000 }), config), { qty: 1 });
});

test('cash at or below the buffer buys nothing', () => {
  assert.ok(isBlocked(gateEntry(entry({ cash: 5000 }), config)));
  assert.ok(isBlocked(gateEntry(entry({ cash: 4000 }), config)));
});

test('a size that rounds down to under 1 share buys nothing', () => {
  assert.ok(isBlocked(gateEntry(entry({ equity: 700, cash: 700 }), config)));
});

test('a price of 0 buys nothing instead of the ceiling', () => {
  assert.ok(isBlocked(gateEntry(entry({ price: 0 }), config)));
});

test('an equity of 0 buys nothing', () => {
  assert.ok(isBlocked(gateEntry(entry({ equity: 0 }), config)));
});

const order = (side: 'buy' | 'sell', status: string, filledQty: number, updatedAt: string): BrokerOrder => ({
  id: `${side}-${status}-${updatedAt}`,
  clientOrderId: 'sma-cross-spy-1',
  symbol: 'SPY',
  side,
  qty: 10,
  type: 'market',
  status,
  filledQty,
  filledAvgPrice: filledQty > 0 ? 600 : null,
  submittedAt: updatedAt,
  updatedAt,
});

test('entries count buys that filled or may still fill', () => {
  const filled = order('buy', 'filled', 10, '2026-10-12T15:00:00.000Z');
  const open = order('buy', 'accepted', 0, '2026-10-12T15:00:00.000Z');
  const partlyCanceled = order('buy', 'canceled', 4, '2026-10-12T15:00:00.000Z');
  const rejected = order('buy', 'rejected', 0, '2026-10-12T15:00:00.000Z');
  const canceled = order('buy', 'canceled', 0, '2026-10-12T15:00:00.000Z');
  const sell = order('sell', 'filled', 10, '2026-10-12T15:00:00.000Z');
  assert.equal(entriesToday([filled, open, partlyCanceled]), 3);
  assert.equal(entriesToday([rejected, canceled, sell]), 0);
  assert.equal(entriesToday([]), 0);
});

test('the last fill is the latest update among orders with any fill', () => {
  const first = order('buy', 'filled', 10, '2026-10-12T15:00:00.000Z');
  const sellLater = order('sell', 'filled', 10, '2026-10-12T15:30:00.000Z');
  const partlyCanceledLatest = order('buy', 'canceled', 4, '2026-10-12T16:00:00.000Z');
  assert.equal(lastFillAt([first, partlyCanceledLatest, sellLater]), '2026-10-12T16:00:00.000Z');
  assert.equal(lastFillAt([sellLater, first]), '2026-10-12T15:30:00.000Z');
});

test('orders with no fill never count as the last fill', () => {
  const filled = order('buy', 'filled', 10, '2026-10-12T15:00:00.000Z');
  const open = order('buy', 'accepted', 0, '2026-10-12T17:00:00.000Z');
  const rejected = order('buy', 'rejected', 0, '2026-10-12T17:00:00.000Z');
  const canceled = order('buy', 'canceled', 0, '2026-10-12T17:00:00.000Z');
  assert.equal(lastFillAt([filled, open, rejected, canceled]), '2026-10-12T15:00:00.000Z');
  assert.equal(lastFillAt([open, rejected, canceled]), null);
  assert.equal(lastFillAt([]), null);
});
