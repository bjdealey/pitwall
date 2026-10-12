import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atET, et } from './et.ts';

test('ET wall times follow daylight saving', () => {
  assert.equal(et(new Date('2026-10-13T03:59:00Z')).date, '2026-10-12');
  assert.equal(atET(new Date('2026-10-12T15:00:00Z'), '16:00'), '2026-10-12T20:00:00.000Z');
  assert.equal(atET(new Date('2026-01-15T15:00:00Z'), '16:00'), '2026-01-15T21:00:00.000Z');
});
