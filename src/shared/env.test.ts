import assert from 'node:assert/strict';
import { test } from 'node:test';
import { engineEnvSchema } from './env.ts';

const parse = (over: Record<string, string> = {}) => engineEnvSchema.safeParse({ PITWALL_BROKER: 'sim', ...over });

test('the rule settings default to the documented values', () => {
  const result = parse();
  assert.ok(result.success);
  assert.partialDeepStrictEqual(result.data, {
    PITWALL_ENTRY_DELAY_MIN: 31,
    PITWALL_ENTRY_CUTOFF_MIN: 30,
    PITWALL_FLAT_BEFORE_CLOSE_MIN: 5,
    PITWALL_STOP_PCT: 1,
    PITWALL_RISK_PCT: 1,
    PITWALL_MAX_POSITION_PCT: 75,
    PITWALL_CASH_BUFFER_PCT: 10,
    PITWALL_MAX_TRADES_PER_DAY: 3,
  });
});

test('a stop under 0.05 percent is refused, and 0.05 is accepted', () => {
  assert.equal(parse({ PITWALL_STOP_PCT: '0.04' }).success, false);
  const floor = parse({ PITWALL_STOP_PCT: '0.05' });
  assert.ok(floor.success);
  assert.equal(floor.data.PITWALL_STOP_PCT, 0.05);
});

test('two strategies on one symbol are refused', () => {
  assert.equal(parse({ PITWALL_STRATEGIES: 'a:SPY,b:SPY' }).success, false);
  assert.equal(parse({ PITWALL_STRATEGIES: 'a:SPY,b:QQQ' }).success, true);
});
