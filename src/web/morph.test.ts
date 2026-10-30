import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameAt, pointsAt, type Drawn } from './morph.ts';

test('pointsAt reads the line at each x and holds its ends past them', () => {
  const line: [number, number][] = [
    [100, 10],
    [200, 50],
    [500, 20],
  ];
  assert.deepEqual(pointsAt(line, [0, 150, 400, 900]), [
    [100, 10],
    [150, 30],
    [400, 30],
    [500, 20],
  ]);
});

// Ten time units across 1000 wide, then a window twice as long that ends at the same time.
const day: Drawn = {
  t0: 0,
  t1: 10,
  line: [
    [0, 100],
    [1000, 0],
  ],
};
const week: Drawn = {
  t0: -10,
  t1: 10,
  line: [
    [0, 50],
    [500, 100],
    [1000, 0],
  ],
};

test('frameAt starts on the first line and lands on the second', () => {
  const start = frameAt(day, week, 0, 1000);
  const end = frameAt(day, week, 1, 1000);
  assert.deepEqual(new Set(start.line.map(String)), new Set(day.line.map(String)));
  assert.deepEqual(new Set(end.line.map(String)), new Set(week.line.map(String)));
  assert.deepEqual([start.t0, start.t1], [0, 10]);
  assert.deepEqual([end.t0, end.t1], [-10, 10]);
});

test('frameAt moves each moment between its two places, like a camera', () => {
  const half = frameAt(day, week, 0.5, 1000);
  // Time 0 sits at x 0 in the day and x 500 in the week, so halfway it is at 250.
  assert.ok(half.line.some(([x, y]) => x === 250 && y === 100));
  // The blended window still ends at time 10 and starts between 0 and -10.
  assert.ok(Math.abs(half.t1 - 10) < 1e-9);
  assert.ok(half.t0 < 0 && half.t0 > -10);
});
