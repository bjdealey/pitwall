import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoCommand, demoSnapshot, demoTick, startDemo } from './demo.ts';
import type { StrategyId } from './domain.ts';

const now = new Date('2026-10-13T17:30:00Z');
const later = (s: number) => new Date(now.getTime() + s * 1000);
const spy = 'sma-cross-spy' as StrategyId;
const equityMatchesStrategies = (state: ReturnType<typeof startDemo>) => {
  const { account, strategies } = state.snapshot;
  return Math.abs(account.equity - (account.lastEquity + state.unattributed + strategies.reduce((sum, s) => sum + s.todayPl, 0))) < 0.011;
};

test('the sample snapshot is a calm session four hours in', () => {
  const s = demoSnapshot(now);
  assert.deepEqual(s.strategies.map((x) => x.state.kind), ['running', 'running']);
  assert.equal(s.equityToday[0]?.at, '2026-10-13T13:30:00.000Z');
  assert.equal(s.account.equity, s.equityToday[s.equityToday.length - 1]?.equity);
  assert.equal(s.market.nextChangeAt, '2026-10-13T20:00:00.000Z');
  assert.equal(s.limits.some((l) => l.breached), false);
});

test('a command waits for the next tick, like the engine', () => {
  const queued = demoCommand(startDemo(now), { kind: 'pause-strategy', strategyId: spy });
  assert.deepEqual(queued.result, { ok: true });
  assert.equal(queued.state.snapshot.strategies[0]?.state.kind, 'running', 'not applied before the tick');
  const ticked = demoTick(queued.state, later(5));
  assert.equal(ticked.snapshot.strategies.find((s) => s.id === spy)?.state.kind, 'paused');
  assert.equal(ticked.snapshot.events[0]?.message, 'Paused sma-cross-spy from dashboard.');
  assert.equal(ticked.queue.length, 0);
});

test('flatten needs a passcode, then closes every position and banks its P&L', () => {
  const start = startDemo(now);
  const refused = demoCommand(start, { kind: 'flatten' });
  assert.deepEqual(refused.result, { ok: false, error: 'Enter the passcode.' });
  assert.equal(refused.state.queue.length, 0);
  const before = demoTick(start, later(5));
  const flat = demoTick(demoCommand(before, { kind: 'flatten' }, 'anything').state, later(10));
  assert.deepEqual(flat.snapshot.positions, []);
  assert.ok(flat.snapshot.strategies.every((s) => s.state.kind === 'paused'));
  assert.equal(flat.snapshot.account.equity, before.snapshot.account.equity, 'closing at the last price keeps equity');
  assert.ok(equityMatchesStrategies(flat));
});

test('the first tick moves equity by price drift only, not by the sample\'s unattributed P&L', () => {
  const start = startDemo(now, 3);
  assert.ok(equityMatchesStrategies(start), 'the starting sample already adds up');
  const first = demoTick(start, later(5));
  assert.ok(Math.abs(first.snapshot.account.equity - start.snapshot.account.equity) < 15, `moved ${first.snapshot.account.equity - start.snapshot.account.equity}`);
});

test('prices walk the same way for the same seed, and equity always adds up', () => {
  const a = demoTick(demoTick(startDemo(now, 7), later(5)), later(10));
  const b = demoTick(demoTick(startDemo(now, 7), later(5)), later(10));
  assert.deepEqual(a.snapshot.positions, b.snapshot.positions);
  assert.ok(equityMatchesStrategies(a));
  assert.notDeepEqual(a.snapshot.positions, startDemo(now, 7).snapshot.positions, 'prices moved');
  assert.equal(a.snapshot.heartbeatAt, later(10).toISOString());
});
