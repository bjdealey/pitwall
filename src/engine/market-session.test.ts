import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atET, marketSession } from './market-session.ts';

const monday = { isOpen: false, nextOpen: '2026-10-12T13:30:00.000Z', nextClose: '2026-10-12T20:00:00.000Z' };

test('an open clock is OPEN until the close', () => {
  const clock = { ...monday, isOpen: true };
  assert.deepEqual(marketSession(clock, new Date('2026-10-12T15:00:00Z')), { state: 'open', nextChangeAt: clock.nextClose });
});

test('04:00 to 09:30 ET on a day the market opens is PRE', () => {
  assert.equal(marketSession(monday, new Date('2026-10-12T08:00:00Z')).state, 'pre');
  assert.equal(marketSession(monday, new Date('2026-10-12T13:29:00Z')).state, 'pre');
  assert.equal(marketSession(monday, new Date('2026-10-12T07:59:00Z')).state, 'closed');
});

test('PRE needs the market to open that day', () => {
  const holiday = { ...monday, nextOpen: '2026-10-13T13:30:00.000Z' };
  assert.equal(marketSession(holiday, new Date('2026-10-12T12:00:00Z')).state, 'closed');
});

test('16:00 to 20:00 ET on a weekday is AFTER and ends at 20:00 ET', () => {
  const tuesday = { ...monday, nextOpen: '2026-10-13T13:30:00.000Z' };
  assert.deepEqual(marketSession(tuesday, new Date('2026-10-12T21:00:00Z')), { state: 'after', nextChangeAt: '2026-10-13T00:00:00.000Z' });
  assert.deepEqual(marketSession(tuesday, new Date('2026-10-13T00:00:00Z')), { state: 'closed', nextChangeAt: tuesday.nextOpen });
});

test('weekend evenings are CLOSED', () => {
  const nextMonday = { isOpen: false, nextOpen: '2026-10-19T13:30:00.000Z', nextClose: '2026-10-19T20:00:00.000Z' };
  assert.equal(marketSession(nextMonday, new Date('2026-10-17T21:00:00Z')).state, 'closed');
});

test('ET wall times follow daylight saving', () => {
  assert.equal(atET(new Date('2026-10-12T15:00:00Z'), '16:00'), '2026-10-12T20:00:00.000Z');
  assert.equal(atET(new Date('2026-01-15T15:00:00Z'), '16:00'), '2026-01-15T21:00:00.000Z');
});
