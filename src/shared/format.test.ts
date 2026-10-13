import assert from 'node:assert/strict';
import { test } from 'node:test';
import { delta, duration, etClock, etTime, localClock, money, pct, qty, signedMoney, signedPct } from './format.ts';

test('money has a dollar sign, thousands commas, two decimals and a true minus', () => {
  assert.equal(money(12345.67), '$12,345.67');
  assert.equal(money(48213.07), '$48,213.07');
  assert.equal(money(-96.1), '−$96.10');
  assert.equal(money(-0.001), '$0.00');
});

test('delta carries sign, percent and glyph, and zero has none', () => {
  assert.equal(delta(412.08, 0.86), '+$412.08 +0.86% ▲');
  assert.equal(delta(-96.1, -0.21), '−$96.10 −0.21% ▼');
  assert.equal(delta(0, 0), '$0.00');
  assert.equal(delta(0.004, 0.00001), '$0.00');
  assert.equal(delta(0.01, 0.00002), '+$0.01 <0.01% ▲');
  assert.equal(delta(-1.3, -0.0026), '−$1.30 <0.01% ▼');
});

test('signed figures never use a hyphen', () => {
  assert.equal(signedMoney(-12.3), '−$12.30');
  assert.equal(signedMoney(0), '$0.00');
  assert.equal(signedPct(-2), '−2.00%');
  assert.equal(signedPct(0.001), '0.00%');
  assert.equal(pct(21.4), '21.40%');
});

test('qty shows up to four decimals with trailing zeros trimmed', () => {
  assert.equal(qty(25), '25');
  assert.equal(qty(0.5), '0.5');
  assert.equal(qty(0.0125), '0.0125');
  assert.equal(qty(0.123456), '0.1235');
  assert.equal(qty(-3), '−3');
  assert.equal(qty(-0.00001), '0');
});

test('durations pick the largest useful unit', () => {
  assert.equal(duration(42), '42s');
  assert.equal(duration(3 * 60 + 59), '3m');
  assert.equal(duration(2 * 3600 + 10 * 60 + 5), '2h 10m');
  assert.equal(duration(2 * 3600), '2h');
  assert.equal(duration(12 * 86400 + 3600), '12d');
  assert.equal(duration(-5), '0s');
});

test('ET times are labeled and follow daylight saving', () => {
  assert.equal(etTime('2026-10-12T13:30:00Z'), '09:30 ET');
  assert.equal(etTime('2026-01-15T14:30:00Z'), '09:30 ET');
  assert.equal(etClock('2026-10-12T18:32:07Z'), '14:32:07');
  assert.equal(etClock('2026-10-13T04:00:00Z'), '00:00:00');
});

test('local clock is 24-hour', () => {
  assert.equal(localClock(new Date(2026, 9, 12, 14, 32, 7).toISOString()), '14:32:07');
});
