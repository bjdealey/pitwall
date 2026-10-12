import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Command, StrategyId, StrategyState } from '../shared/domain.ts';
import { step, type LifecycleInput } from './strategy-lifecycle.ts';

const spy = 'sma-cross-spy' as StrategyId;
const qqq = 'sma-cross-qqq' as StrategyId;
const iwm = 'sma-cross-iwm' as StrategyId;
const now = '2026-10-12T15:00:00.000Z';
const earlier = '2026-10-12T14:00:00.000Z';
const running: StrategyState = { kind: 'running' };
const paused: StrategyState = { kind: 'paused', by: 'you', at: earlier };
const halted: StrategyState = { kind: 'halted', reason: 'Daily loss limit reached.', at: earlier };
const given = (...entries: [StrategyId, StrategyState][]) => new Map(entries);
const command = (c: Command): LifecycleInput => ({ type: 'command', command: c });
const breach: LifecycleInput = { type: 'limit-breached', limit: 'daily-loss', reason: 'Daily loss limit reached ($1,000.00 of $1,000.00).' };

test('pause all pauses running strategies, leaves halted ones, and cancels orders', () => {
  const before = given([spy, running], [qqq, halted]);
  const { states, effects } = step(before, command({ kind: 'pause-all' }), now);
  assert.deepEqual(states.get(spy), { kind: 'paused', by: 'you', at: now });
  assert.deepEqual(states.get(qqq), halted);
  assert.deepEqual(effects, [
    { type: 'cancel-open-orders' },
    { type: 'event', severity: 'info', message: 'Pause all from dashboard.', source: 'you' },
  ]);
  assert.deepEqual(before.get(spy), running, 'input map is not mutated');
});

test('flatten pauses everything not already paused and closes all positions', () => {
  const { states, effects } = step(given([spy, running], [qqq, halted], [iwm, paused]), command({ kind: 'flatten' }), now);
  assert.deepEqual(states.get(spy), { kind: 'paused', by: 'you', at: now });
  assert.deepEqual(states.get(qqq), { kind: 'paused', by: 'you', at: now });
  assert.deepEqual(states.get(iwm), paused, 'an earlier pause keeps its time');
  assert.deepEqual(effects.map((e) => e.type), ['cancel-open-orders', 'close-all-positions', 'event']);
  assert.equal(effects[2]?.type === 'event' && effects[2].severity, 'warn');
});

test('pausing one strategy cancels only its orders', () => {
  const { states, effects } = step(given([spy, running], [qqq, running]), command({ kind: 'pause-strategy', strategyId: spy }), now);
  assert.deepEqual(states.get(spy), { kind: 'paused', by: 'you', at: now });
  assert.deepEqual(states.get(qqq), running);
  assert.deepEqual(effects[0], { type: 'cancel-open-orders', strategyId: spy });
  assert.equal(effects.length, 2);
});

test('pausing a strategy that is not running does nothing', () => {
  const before = given([spy, halted]);
  const { states, effects } = step(before, command({ kind: 'pause-strategy', strategyId: spy }), now);
  assert.deepEqual(states, before);
  assert.deepEqual(effects, []);
});

test('resume moves paused or halted to running and logs it', () => {
  for (const from of [paused, halted]) {
    const { states, effects } = step(given([spy, from]), command({ kind: 'resume-strategy', strategyId: spy }), now);
    assert.deepEqual(states.get(spy), running);
    assert.deepEqual(effects, [{ type: 'event', severity: 'info', message: 'Resumed sma-cross-spy from dashboard.', source: 'you' }]);
  }
});

test('an unknown strategy only produces a warn event', () => {
  const before = given([spy, running]);
  const { states, effects } = step(before, command({ kind: 'resume-strategy', strategyId: iwm }), now);
  assert.deepEqual(states, before);
  assert.deepEqual(effects, [{ type: 'event', severity: 'warn', message: 'Unknown strategy sma-cross-iwm. Command ignored.', source: 'engine' }]);
});

test('a breach halts running strategies with the reason, and repeating it is a no-op', () => {
  const first = step(given([spy, running], [qqq, paused]), breach, now);
  assert.deepEqual(first.states.get(spy), { kind: 'halted', reason: breach.type === 'limit-breached' ? breach.reason : '', at: now });
  assert.deepEqual(first.states.get(qqq), paused);
  assert.deepEqual(first.effects, [
    { type: 'cancel-open-orders' },
    { type: 'event', severity: 'halt', message: 'Daily loss limit reached ($1,000.00 of $1,000.00). Halted sma-cross-spy.', source: 'engine' },
  ]);

  const second = step(first.states, breach, '2026-10-12T15:00:05.000Z');
  assert.deepEqual(second.states, first.states);
  assert.deepEqual(second.effects, []);
});
