import { startTransition, useActionState, useEffect, useState } from 'react';
import type { Command, Snapshot } from '../shared/domain.ts';

const STREAM_STALE_MS = 3_000;
const HEARTBEAT_STALE_MS = 15_000;

// serverTime and receivedAt sit beside the snapshot so a tick moves them without giving the snapshot a new identity.
export type Feed = { snapshot: Snapshot; serverTime: string; receivedAt: number };

/** One EventSource for the whole app. Calls onSignedOut when the stream closes because the session is gone. */
export function useSnapshot(onSignedOut: () => void): Feed | null {
  const [feed, setFeed] = useState<Feed | null>(null);
  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      source = new EventSource('/api/stream');
      source.addEventListener('snapshot', (e: MessageEvent<string>) => {
        const snapshot: Snapshot = JSON.parse(e.data);
        setFeed({ snapshot, serverTime: snapshot.serverTime, receivedAt: Date.now() });
      });
      source.addEventListener('tick', (e: MessageEvent<string>) => setFeed((feed) => feed && { ...feed, serverTime: e.data, receivedAt: Date.now() }));
      source.onerror = () => {
        if (source?.readyState !== EventSource.CLOSED) return;
        fetch('/api/session').then(
          (r) => (r.status === 401 ? onSignedOut() : (retry = setTimeout(open, 3_000))),
          () => (retry = setTimeout(open, 3_000)),
        );
      };
    };
    open();
    return () => {
      source?.close();
      clearTimeout(retry);
    };
  }, [onSignedOut]);
  return feed;
}

export function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Heartbeat age measured on the server clock, plus time since this snapshot arrived, so a skewed browser clock cannot hide staleness. */
export function freshness({ snapshot, serverTime, receivedAt }: Feed, now: number) {
  const sinceReceived = now - receivedAt;
  const heartbeatAgeMs = snapshot.heartbeatAt === null ? Infinity : Date.parse(serverTime) - Date.parse(snapshot.heartbeatAt) + sinceReceived;
  return { stale: sinceReceived > STREAM_STALE_MS || heartbeatAgeMs > HEARTBEAT_STALE_MS, heartbeatAgeMs };
}

export type PostResult = { ok: true } | { ok: false; error: string };

const lockedMessage = (iso: string) =>
  `Too many wrong passcodes. Locked until ${new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}.`;

export async function postJson(url: string, body: unknown): Promise<PostResult> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: 'Pitwall API unreachable. Check the Pi is on and Tailscale is connected.' };
  }
  if (res.ok) return { ok: true };
  const data: { error?: unknown; lockedUntil?: unknown } = await res.json().catch(() => ({}));
  if (typeof data.lockedUntil === 'string') return { ok: false, error: lockedMessage(data.lockedUntil) };
  return { ok: false, error: typeof data.error === 'string' ? data.error : `Request failed (${res.status}).` };
}

/** A POST run as a React action: busy while in flight, the error it returned, and onOk once it succeeds. */
export function usePost(post: () => Promise<PostResult>, onOk: () => void) {
  const [error, run, busy] = useActionState<string | null>(async () => {
    const result = await post();
    if (result.ok) onOk();
    return result.ok ? null : result.error;
  }, null);
  return { error, busy, send: () => startTransition(run) };
}

export const sendCommand = (command: Command, passcode?: string) => postJson('/api/commands', passcode === undefined ? command : { ...command, passcode });
