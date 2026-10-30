import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Order, StrategyId } from './domain.ts';
import { ordersCsv } from './orders.ts';

const order = (o: Partial<Order>): Order => ({ id: 'o1', strategyId: 'sma-cross-spy' as StrategyId, symbol: 'SPY', side: 'buy', qty: 12, type: 'market', status: 'filled', filledQty: 12, filledAvgPrice: 571.2, submittedAt: '2026-10-13T14:02:11.000Z', ...o });

test('ordersCsv writes a header and one row per order, manual orders named', () => {
  const csv = ordersCsv([order({}), order({ id: 'o2', strategyId: null, status: 'new', filledQty: 0, filledAvgPrice: null })]);
  assert.equal(
    csv,
    'Submitted (UTC),Symbol,Side,Qty,Type,Status,Filled,Avg fill,Strategy\r\n' +
      '2026-10-13T14:02:11.000Z,SPY,buy,12,market,filled,12,571.2,sma-cross-spy\r\n' +
      '2026-10-13T14:02:11.000Z,SPY,buy,12,market,new,0,,manual\r\n',
  );
});

test('ordersCsv quotes commas and quotes, and defuses formulas', () => {
  const [, row] = ordersCsv([order({ symbol: 'BRK,B', type: 'say "hi"', status: '=HYPERLINK("x")' })]).split('\r\n');
  assert.equal(row, '2026-10-13T14:02:11.000Z,"BRK,B",buy,12,"say ""hi""","\'=HYPERLINK(""x"")",12,571.2,sma-cross-spy');
});

test('ordersCsv of no orders is the header alone', () => {
  assert.equal(ordersCsv([]), 'Submitted (UTC),Symbol,Side,Qty,Type,Status,Filled,Avg fill,Strategy\r\n');
});
