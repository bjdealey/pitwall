import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, ORDER_QTY } from './sma-cross.ts';

const flat = Array<number>(30).fill(100);
const crossUp = [...flat, 110];
const crossDown = [...flat, 90];

test('fast crossing above slow buys a fixed qty when flat', () => {
  assert.deepEqual(decide(crossUp, 0), { side: 'buy', qty: ORDER_QTY });
  assert.equal(decide(crossUp, 10), null, 'already holding');
});

test('fast crossing below slow sells the whole position', () => {
  assert.deepEqual(decide(crossDown, 7), { side: 'sell', qty: 7 });
  assert.equal(decide(crossDown, 0), null, 'nothing to sell');
});

test('no cross, no order', () => {
  const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
  assert.equal(decide(rising, 0), null);
  assert.equal(decide(rising.toReversed(), 10), null);
});

test('too few bars, no order', () => {
  assert.equal(decide(crossUp.slice(1), 0), null);
});
