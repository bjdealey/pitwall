import type { Command, LimitId, Severity, StrategyId, StrategyState } from '../shared/domain.ts';

export type LifecycleInput = { type: 'command'; command: Command } | { type: 'limit-breached'; limit: LimitId; reason: string };

export type Effect =
  | { type: 'cancel-open-orders'; strategyId?: StrategyId }
  | { type: 'close-all-positions' }
  | { type: 'event'; severity: Severity; message: string; source: string };

type States = Map<StrategyId, StrategyState>;

const event = (severity: Severity, message: string, source = 'you'): Effect => ({ type: 'event', severity, message, source });

function moveAll(states: States, from: (s: StrategyState) => boolean, to: StrategyState): StrategyId[] {
  const moved: StrategyId[] = [];
  for (const [id, s] of states) {
    if (!from(s)) continue;
    states.set(id, to);
    moved.push(id);
  }
  return moved;
}

export function step(current: ReadonlyMap<StrategyId, StrategyState>, input: LifecycleInput, now: string): { states: States; effects: Effect[] } {
  const states = new Map(current);
  const pausedByYou: StrategyState = { kind: 'paused', by: 'you', at: now };

  if (input.type === 'limit-breached') {
    const halted = moveAll(states, (s) => s.kind === 'running', { kind: 'halted', reason: input.reason, at: now });
    if (halted.length === 0) return { states, effects: [] };
    return { states, effects: [{ type: 'cancel-open-orders' }, event('halt', `${input.reason} Halted ${halted.join(', ')}.`, 'engine')] };
  }

  const { command } = input;
  switch (command.kind) {
    case 'pause-all':
      moveAll(states, (s) => s.kind === 'running', pausedByYou);
      return { states, effects: [{ type: 'cancel-open-orders' }, event('info', 'Pause all from dashboard.')] };
    case 'flatten':
      moveAll(states, (s) => s.kind !== 'paused', pausedByYou);
      return {
        states,
        effects: [{ type: 'cancel-open-orders' }, { type: 'close-all-positions' }, event('warn', 'Flatten from dashboard. Closing all positions.')],
      };
    case 'pause-strategy':
    case 'resume-strategy': {
      const id = command.strategyId;
      const state = states.get(id);
      if (!state) return { states, effects: [event('warn', `Unknown strategy ${id}. Command ignored.`, 'engine')] };
      if (command.kind === 'pause-strategy') {
        if (state.kind !== 'running') return { states, effects: [] };
        states.set(id, pausedByYou);
        return { states, effects: [{ type: 'cancel-open-orders', strategyId: id }, event('info', `Paused ${id} from dashboard.`)] };
      }
      if (state.kind === 'running') return { states, effects: [] };
      states.set(id, { kind: 'running' });
      return { states, effects: [event('info', `Resumed ${id} from dashboard.`)] };
    }
  }
}
