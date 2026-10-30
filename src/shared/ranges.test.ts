import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_RANGES, rangeCloses } from './ranges.ts';

const start = (id: string, today: string) => DAILY_RANGES.find((r) => r.id === id)?.start(today);

test('ranges start a month, three months, the year and a year back from today', () => {
  assert.equal(start('1m', '2026-10-29'), '2026-09-29');
  assert.equal(start('3m', '2026-10-29'), '2026-07-29');
  assert.equal(start('ytd', '2026-10-29'), '2026-01-01');
  assert.equal(start('1y', '2026-10-29'), '2025-10-29');
  assert.equal(start('1m', '2026-01-15'), '2025-12-15');
  assert.equal(start('all', '2026-10-29'), '');
});

test('rangeCloses keeps closes from the start and ends on the live equity, not the stored today', () => {
  const days = [
    { date: '2026-09-28', equity: 1 },
    { date: '2026-09-29', equity: 2 },
    { date: '2026-10-28', equity: 3 },
    { date: '2026-10-29', equity: 4 },
  ];
  assert.deepEqual(rangeCloses(days, '2026-09-29', '2026-10-29', 5), [
    { date: '2026-09-29', equity: 2 },
    { date: '2026-10-28', equity: 3 },
    { date: '2026-10-29', equity: 5 },
  ]);
  assert.deepEqual(rangeCloses([], '', '2026-10-29', 5), [{ date: '2026-10-29', equity: 5 }]);
});
