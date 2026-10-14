import { startTransition, useActionState, useEffect, useEffectEvent, useState } from 'react';
import type { Command, Snapshot } from '../shared/domain.ts';

const STREAM_STALE_MS = 3_000;
export const HEARTBEAT_STALE_MS = 15_000;

// serverTime and receivedAt sit beside the snapshot so a tick moves them without giving the snapshot a new identity.
export type Feed = { snapshot: Snapshot; serverTime: string; receivedAt: number };

/** One EventSource for the whole app. Calls onSignedOut when the stream closes because the session is gone. */
export function useSnapshot(onSignedOut: () => void): Feed | null {
  const [feed, setFeed] = useState<Feed | null>(null);
  const signOut = useEffectEvent(onSignedOut);
  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const retryOrSignOut = (status?: number) => {
      if (disposed) return;
      if (status === 401) signOut();
      else retry = setTimeout(open, 3_000);
    };
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
          (r) => retryOrSignOut(r.status),
          () => retryOrSignOut(),
        );
      };
    };
    open();
    return () => {
      disposed = true;
      source?.close();
      clearTimeout(retry);
    };
  }, []);
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

const UNREACHABLE = 'Pitwall API unreachable. Check the Pi is on and Tailscale is connected.';

const lockedMessage = (iso: string) =>
  `Too many wrong passcodes. Locked until ${new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}.`;

export async function postJson(url: string, body: unknown): Promise<PostResult> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  if (res.ok) return { ok: true };
  const data: { error?: unknown; lockedUntil?: unknown } = await res.json().catch(() => ({}));
  if (typeof data.lockedUntil === 'string') return { ok: false, error: lockedMessage(data.lockedUntil) };
  if (typeof data.error === 'string') return { ok: false, error: data.error };
  // The dev proxy and tailscale serve answer 502 to 504 when the API process is down.
  return { ok: false, error: res.status >= 502 && res.status <= 504 ? UNREACHABLE : `Request failed (${res.status}).` };
}

/** A POST run as a React action: busy while in flight, the error it returned, and onOk once it succeeds. attempt counts finished tries, so the same error twice still re-announces. */
export function usePost(post: () => Promise<PostResult>, onOk: () => void) {
  const [state, run, busy] = useActionState<{ error: string | null; attempt: number }>(async ({ attempt }) => {
    const result = await post();
    if (result.ok) onOk();
    return { error: result.ok ? null : result.error, attempt: attempt + 1 };
  }, { error: null, attempt: 0 });
  return { ...state, busy, send: () => startTransition(run) };
}

export const sendCommand = (command: Command, passcode?: string) => postJson('/api/commands', passcode === undefined ? command : { ...command, passcode });
