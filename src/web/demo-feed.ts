import { demoCommand, demoDailyEquity, demoTick, startDemo, type DemoState } from '../shared/demo.ts';
import type { Command, Snapshot } from '../shared/domain.ts';
import { et } from '../shared/et.ts';
import type { PostResult } from './data.ts';

// The demo's clock starts at 13:30 ET today, mid-session, whenever someone opens it, so the market is open and the times agree.
const offset = (810 - et(new Date()).minutes) * 60_000;
const clock = () => new Date(Date.now() + offset);

let state: DemoState | undefined;
const current = () => (state ??= startDemo(clock(), Date.now() % 2_147_483_647));

/** Stands in for the SSE stream: a snapshot on every 5-second engine tick and a time tick every second. */
export function subscribeDemo(onSnapshot: (snapshot: Snapshot) => void, onTick: (serverTime: string) => void) {
  onSnapshot(current().snapshot);
  const engine = setInterval(() => {
    state = demoTick(current(), clock());
    onSnapshot(state.snapshot);
  }, 5_000);
  const timer = setInterval(() => onTick(clock().toISOString()), 1_000);
  return () => {
    clearInterval(engine);
    clearInterval(timer);
  };
}

/** Stands in for POST: commands queue for the next demo tick; sign-in always succeeds. */
export function postDemo(url: string, body: unknown): PostResult {
  if (url !== '/api/commands') return { ok: true };
  const { passcode, ...command } = body as Command & { passcode?: string };
  const queued = demoCommand(current(), command as Command, passcode);
  state = queued.state;
  return queued.result;
}

/** Stands in for GET /api/equity/daily, on the demo's clock. */
export const dailyDemo = () => demoDailyEquity(clock());
