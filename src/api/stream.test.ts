import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Snapshot } from '../shared/domain.ts';
import { nextFrame } from './stream.ts';

const snapshot: Snapshot = {
  serverTime: '2026-10-14T13:30:00.000Z',
  mode: 'paper',
  heartbeatAt: '2026-10-14T13:29:58.000Z',
  market: { state: 'open', nextChangeAt: '2026-10-14T20:00:00.000Z' },
  account: { equity: 100_000, lastEquity: 100_000, buyingPower: 200_000, cash: 100_000 },
  equityToday: [{ at: '2026-10-14T13:29:00.000Z', equity: 100_000 }],
  positions: [],
  orders: [],
  strategies: [],
  limits: [],
  health: { brokerConnected: true, cpuTempC: null, throttled: null, diskUsedPct: null, memUsedBytes: 1, memTotalBytes: 2, uptimeS: 60 },
  events: [],
};

test('the first frame of a connection is the whole snapshot', () => {
  const frame = nextFrame(snapshot, '');
  assert.equal(frame.event, 'snapshot');
  assert.deepEqual(JSON.parse(frame.data), snapshot);
});

test('a snapshot that only moved serverTime goes out as a tick carrying the time', () => {
  const first = nextFrame(snapshot, '');
  const later = nextFrame({ ...snapshot, serverTime: '2026-10-14T13:30:01.000Z' }, first.body);
  assert.deepEqual({ event: later.event, data: later.data }, { event: 'tick', data: '2026-10-14T13:30:01.000Z' });
  assert.equal(later.body, first.body);
});

test('any other change sends the whole snapshot again', () => {
  const first = nextFrame(snapshot, '');
  const changed = { ...snapshot, serverTime: '2026-10-14T13:30:05.000Z', heartbeatAt: '2026-10-14T13:30:03.000Z' };
  const frame = nextFrame(changed, first.body);
  assert.equal(frame.event, 'snapshot');
  assert.deepEqual(JSON.parse(frame.data), changed);
  assert.notEqual(frame.body, first.body);
});
