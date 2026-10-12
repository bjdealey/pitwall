import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLockout, hashPasscode, LOCK_MS, parsePasscodeHash, signSession, verifyPasscode, verifySession } from './auth.ts';

const secret = 'a-test-secret-that-is-long-enough-000';
const now = Date.parse('2026-10-12T15:00:00Z');

test('a signed session verifies until it expires', () => {
  const cookie = signSession(secret, now + 1000);
  assert.equal(verifySession(secret, cookie, now), true);
  assert.equal(verifySession(secret, cookie, now + 1000), false, 'expired');
});

test('tampered, foreign or malformed sessions are refused', () => {
  const cookie = signSession(secret, now + 1000);
  const [, signature] = cookie.split('.');
  assert.equal(verifySession(secret, `${now + 999_999}.${signature}`, now), false, 'extended expiry');
  assert.equal(verifySession(secret, `${cookie.slice(0, -1)}${cookie.endsWith('A') ? 'B' : 'A'}`, now), false, 'flipped signature');
  assert.equal(verifySession('another-secret-that-is-long-enough-000', cookie, now), false, 'other secret');
  assert.equal(verifySession(secret, undefined, now), false);
  assert.equal(verifySession(secret, 'garbage', now), false);
  assert.equal(verifySession(secret, `0x${(now + 1000).toString(16)}.${signature}`, now), false);
});

test('a passcode hash round-trips through its PHC string', async () => {
  const encoded = await hashPasscode('483920');
  assert.match(encoded, /^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
  const hash = parsePasscodeHash(encoded);
  assert.ok(hash);
  assert.equal(await verifyPasscode('483920', hash), true);
  assert.equal(await verifyPasscode('483921', hash), false);
  assert.equal(parsePasscodeHash('$argon2i$v=19$m=1,t=1,p=1$AAAA$AAAA'), null);
});

test('five wrong passcodes lock for 15 minutes, then a right one works', async () => {
  const attempt = createLockout();
  let clock = now;
  const at = () => clock;
  const wrong = async () => false;
  const right = async () => true;
  for (const triesLeft of [4, 3, 2, 1]) assert.deepEqual(await attempt(at, wrong), { kind: 'wrong', triesLeft });
  assert.deepEqual(await attempt(at, wrong), { kind: 'locked', lockedUntil: now + LOCK_MS });
  assert.deepEqual(await attempt(at, right), { kind: 'locked', lockedUntil: now + LOCK_MS }, 'right passcode is refused while locked');
  clock = now + LOCK_MS;
  assert.deepEqual(await attempt(at, right), { kind: 'ok' });
});

test('a right passcode resets the count', async () => {
  const attempt = createLockout();
  for (let i = 0; i < 4; i++) await attempt(() => now, async () => false);
  await attempt(() => now, async () => true);
  assert.deepEqual(await attempt(() => now, async () => false), { kind: 'wrong', triesLeft: 4 });
});

test('parallel guesses cannot outrun the lockout', async () => {
  const attempt = createLockout();
  let verified = 0;
  const slowWrong = async () => {
    verified++;
    await new Promise((r) => setTimeout(r, 5));
    return false;
  };
  const results = await Promise.all(Array.from({ length: 20 }, () => attempt(() => now, slowWrong)));
  assert.equal(verified, 5);
  assert.equal(results.filter((r) => r.kind === 'locked').length, 16);
});
