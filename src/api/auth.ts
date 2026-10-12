import { argon2, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);

const COST = { memory: 65_536, passes: 3, parallelism: 4 };

export type PasscodeHash = { memory: number; passes: number; parallelism: number; nonce: Buffer; tag: Buffer };

export async function hashPasscode(passcode: string): Promise<string> {
  const nonce = randomBytes(16);
  const tag = await argon2Async('argon2id', { message: passcode, nonce, tagLength: 32, ...COST });
  const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=${COST.memory},t=${COST.passes},p=${COST.parallelism}$${b64(nonce)}$${b64(tag)}`;
}

export function parsePasscodeHash(encoded: string): PasscodeHash | null {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(encoded);
  if (!m) return null;
  const [, memory, passes, parallelism, nonce, tag] = m;
  return { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism), nonce: Buffer.from(nonce ?? '', 'base64'), tag: Buffer.from(tag ?? '', 'base64') };
}

export async function verifyPasscode(passcode: string, hash: PasscodeHash): Promise<boolean> {
  const { memory, passes, parallelism, nonce, tag } = hash;
  const actual = await argon2Async('argon2id', { message: passcode, nonce, memory, passes, parallelism, tagLength: tag.length });
  return timingSafeEqual(actual, tag);
}

export const SESSION_MS = 30 * 86_400_000;

const mac = (secret: string, expiresAtMs: number) => createHmac('sha256', secret).update(String(expiresAtMs)).digest('base64url');

export const signSession = (secret: string, expiresAtMs: number) => `${expiresAtMs}.${mac(secret, expiresAtMs)}`;

export function verifySession(secret: string, cookie: string | undefined, nowMs: number): boolean {
  const [expires = '', signature = ''] = (cookie ?? '').split('.');
  const expiresAtMs = Number(expires);
  if (!/^\d+$/.test(expires) || expiresAtMs <= nowMs) return false;
  const expected = Buffer.from(mac(secret, expiresAtMs));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const MAX_TRIES = 5;
export const LOCK_MS = 15 * 60_000;

export type Attempt = { kind: 'ok' } | { kind: 'wrong'; triesLeft: number } | { kind: 'locked'; lockedUntil: number };

/**
 * Counts wrong passcodes across login and flatten. Attempts run one at a time so
 * parallel guesses cannot all start before the fifth failure locks.
 * ponytail: in-memory, so restarting the API resets the count. Persist it if
 * restarts ever become reachable by whoever is guessing.
 */
export function createLockout() {
  let failures = 0;
  let lockedUntil = 0;
  let queue: Promise<unknown> = Promise.resolve();

  async function attempt(now: () => number, verify: () => Promise<boolean>): Promise<Attempt> {
    if (now() < lockedUntil) return { kind: 'locked', lockedUntil };
    if (await verify()) {
      failures = 0;
      return { kind: 'ok' };
    }
    failures++;
    if (failures < MAX_TRIES) return { kind: 'wrong', triesLeft: MAX_TRIES - failures };
    failures = 0;
    lockedUntil = now() + LOCK_MS;
    return { kind: 'locked', lockedUntil };
  }

  return (now: () => number, verify: () => Promise<boolean>): Promise<Attempt> => {
    const result = queue.then(() => attempt(now, verify));
    queue = result.catch(() => {});
    return result;
  };
}
