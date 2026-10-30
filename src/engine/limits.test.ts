import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account, LimitId } from '../shared/domain.ts';
import { breachReason, evaluateLimits, tradesLimit, type LimitInput } from './limits.ts';

const config = { dailyLossPct: 2, maxRejections: 4, brokerSilenceS: 30 };
const now = new Date('2026-10-12T15:00:00Z');
const account = (equity: number, lastEquity = 50_000): Account => ({ equity, lastEquity, buyingPower: equity, cash: equity });
const input = (over: Partial<LimitInput> = {}): LimitInput => ({ account: account(50_000), consecutiveRejections: 0, lastBrokerOkAt: now, now, ...over });
const find = (id: LimitId, i: LimitInput) => {
  const l = evaluateLimits(i, config).find((x) => x.id === id);
  assert.ok(l);
  return l;
};

test('daily loss is the drop from last equity against pct of last equity', () => {
  const below = find('daily-loss', input({ account: account(49_500) }));
  assert.deepEqual([below.used, below.max, below.breached], [500, 1000, false]);
  assert.equal(below.detail, '$500.00 of $1,000.00');
  assert.equal(find('daily-loss', input({ account: account(49_000) })).breached, true);
  assert.equal(find('daily-loss', input({ account: account(51_000) })).used, 0, 'gains do not count');
});

test('a zero baseline never breaches the daily loss limit', () => {
  assert.equal(find('daily-loss', input({ account: account(0, 0) })).breached, false);
});

test('rejections breach at the max in a row', () => {
  assert.equal(find('rejections', input({ consecutiveRejections: 3 })).breached, false);
  const at = find('rejections', input({ consecutiveRejections: 4 }));
  assert.equal(at.breached, true);
  assert.equal(breachReason(at), 'Rejection limit reached (4 of 4 orders in a row).');
});

test('broker silence counts seconds since the last good call', () => {
  const quiet = (s: number) => find('broker-silence', input({ lastBrokerOkAt: new Date(now.getTime() - s * 1000) }));
  assert.deepEqual([quiet(29).used, quiet(29).breached], [29, false]);
  assert.equal(quiet(30).breached, true);
  assert.equal(quiet(30).detail, '30s of 30s since last reply');
});

test('the trade cap fills at the max and never reads as a breach', () => {
  assert.deepEqual(tradesLimit(3, 3), { id: 'trades', label: 'Daily trade limit', used: 3, max: 3, detail: '3 of 3 entries today', breached: false });
  assert.equal(tradesLimit(4, 3).breached, false);
  assert.equal(tradesLimit(0, 3).detail, '0 of 3 entries today');
});

test('the trade cap is not in the limits that halt', () => {
  assert.deepEqual(evaluateLimits(input(), config).map((l) => l.id), ['daily-loss', 'rejections', 'broker-silence']);
});
