import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BrokerOrder } from './broker.ts';
import { todayStats } from './stats.ts';

const fill = (side: 'buy' | 'sell', filledQty: number, filledAvgPrice: number | null, status = 'filled'): BrokerOrder => ({
  id: `${side}-${filledQty}-${filledAvgPrice}`,
  clientOrderId: 'sma-cross-spy-1',
  symbol: 'SPY',
  side,
  qty: filledQty || 10,
  type: 'market',
  status,
  filledQty,
  filledAvgPrice,
  submittedAt: '2026-10-12T15:00:00.000Z',
  updatedAt: '2026-10-12T15:00:00.000Z',
});

test('a round trip realizes the price difference', () => {
  assert.deepEqual(todayStats([fill('buy', 10, 100), fill('sell', 10, 103)], undefined), { todayPl: 30, fillsToday: 2 });
});

test('an open buy is marked at the last price', () => {
  assert.deepEqual(todayStats([fill('buy', 10, 100)], 98.5), { todayPl: -15, fillsToday: 1 });
});

test('unfilled orders count for nothing', () => {
  assert.deepEqual(todayStats([fill('buy', 0, null, 'rejected')], 100), { todayPl: 0, fillsToday: 0 });
});
