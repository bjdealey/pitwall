import type { Snapshot } from '../shared/domain.ts';

export type Frame = { event: 'snapshot' | 'tick'; data: string; body: string };

/** Between engine ticks only serverTime moves, so an unchanged snapshot goes out as a tick that carries just the time. */
export function nextFrame(snapshot: Snapshot, lastBody: string): Frame {
  const { serverTime, ...rest } = snapshot;
  const body = JSON.stringify(rest);
  return body === lastBody ? { event: 'tick', data: serverTime, body } : { event: 'snapshot', data: JSON.stringify(snapshot), body };
}
