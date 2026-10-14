import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { openDb } from '../shared/db.ts';
import { commandSchema, type Snapshot } from '../shared/domain.ts';
import { apiEnvSchema, parseEnv } from '../shared/env.ts';
import { atET } from '../shared/et.ts';
import * as t from '../shared/schema.ts';
import { createLockout, parsePasscodeHash, SESSION_MS, signSession, verifyPasscode, verifySession } from './auth.ts';
import { nextFrame } from './stream.ts';

const COOKIE = 'pitwall_session';
const ENGINE_DOWN_MS = 60_000;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const env = parseEnv(apiEnvSchema);
const passcodeHash = parsePasscodeHash(env.PITWALL_PASSCODE_HASH) ?? fail('Invalid environment. PITWALL_PASSCODE_HASH is not an argon2id string from npm run hash-passcode.');
const db = openDb(env.PITWALL_DB);
const attempt = createLockout();

function readSnapshot(): Snapshot | null {
  const status = db.select().from(t.status).where(eq(t.status.id, 1)).get();
  if (!status) return null;
  const now = new Date();
  const dayStart = atET(now, '00:00');
  const equityToday = db
    .select({ at: sql<string>`max(${t.equitySamples.at})`, equity: t.equitySamples.equity })
    .from(t.equitySamples)
    .where(gte(t.equitySamples.at, dayStart))
    .groupBy(sql`substr(${t.equitySamples.at}, 1, 16)`)
    .orderBy(sql`1`)
    .all();
  const orders = db
    .select({
      id: t.orders.id,
      strategyId: t.orders.strategyId,
      symbol: t.orders.symbol,
      side: t.orders.side,
      qty: t.orders.qty,
      type: t.orders.type,
      status: t.orders.status,
      filledQty: t.orders.filledQty,
      filledAvgPrice: t.orders.filledAvgPrice,
      submittedAt: t.orders.submittedAt,
    })
    .from(t.orders)
    .where(gte(t.orders.submittedAt, dayStart))
    .orderBy(desc(t.orders.submittedAt))
    .all();
  const events = db.select().from(t.events).orderBy(desc(t.events.id)).limit(200).all();
  const { mode, heartbeatAt, market, account, positions, strategies, limits, health } = status;
  return { serverTime: now.toISOString(), mode, heartbeatAt, market, account, equityToday, positions, orders, strategies, limits, health, events };
}

const signedIn = (c: Context) => verifySession(env.PITWALL_SESSION_SECRET, getCookie(c, COOKIE), Date.now());

async function refusePasscode(c: Context, passcode: string) {
  const result = await attempt(Date.now, () => verifyPasscode(passcode, passcodeHash));
  switch (result.kind) {
    case 'ok':
      return null;
    case 'wrong':
      return c.json({ error: `Wrong passcode. ${result.triesLeft} ${result.triesLeft === 1 ? 'try' : 'tries'} left.`, triesLeft: result.triesLeft }, 401);
    case 'locked':
      return c.json({ error: 'Too many wrong passcodes. Sign-in is locked.', lockedUntil: new Date(result.lockedUntil).toISOString() }, 429);
  }
}

const passcodeBody = z.object({ passcode: z.string().min(1) });
const readJson = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

const app = new Hono();

app.post('/api/login', async (c) => {
  const body = passcodeBody.safeParse(await readJson(c));
  if (!body.success) return c.json({ error: 'Enter the passcode.' }, 400);
  const refused = await refusePasscode(c, body.data.passcode);
  if (refused) return refused;
  setCookie(c, COOKIE, signSession(env.PITWALL_SESSION_SECRET, Date.now() + SESSION_MS), {
    httpOnly: true,
    sameSite: 'Strict',
    secure: true,
    path: '/',
    maxAge: SESSION_MS / 1000,
  });
  return c.body(null, 204);
});

app.post('/api/logout', (c) => {
  deleteCookie(c, COOKIE, { httpOnly: true, sameSite: 'Strict', secure: true, path: '/' });
  return c.body(null, 204);
});

app.get('/api/session', (c) => c.body(null, signedIn(c) ? 204 : 401));

app.use('/api/*', async (c, next) => {
  if (!signedIn(c)) return c.json({ error: 'Sign in first.' }, 401);
  await next();
});

app.get('/api/stream', (c) =>
  streamSSE(c, async (stream) => {
    let last = '';
    while (!stream.aborted) {
      const snapshot = readSnapshot();
      if (snapshot) {
        const frame = nextFrame(snapshot, last);
        last = frame.body;
        await stream.writeSSE({ event: frame.event, data: frame.data });
      }
      await stream.sleep(1000);
    }
  }),
);

app.post('/api/commands', async (c) => {
  const body = await readJson(c);
  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400);
  const command = parsed.data;
  if (command.kind === 'flatten') {
    const confirm = passcodeBody.safeParse(body);
    if (!confirm.success) return c.json({ error: 'Enter the passcode.' }, 400);
    const refused = await refusePasscode(c, confirm.data.passcode);
    if (refused) return refused;
  }
  const strategyId = command.kind === 'pause-strategy' || command.kind === 'resume-strategy' ? command.strategyId : null;
  const { id } = db.insert(t.commands).values({ at: new Date().toISOString(), kind: command.kind, strategyId, by: 'you' }).returning({ id: t.commands.id }).get();
  return c.json({ id }, 202);
});

app.use('/*', serveStatic({ root: './dist/web' }));
app.get('*', serveStatic({ path: './dist/web/index.html' }));

const ntfy = env.NTFY_URL;
if (ntfy) {
  const startedAt = Date.now();
  let alerted = false;
  setInterval(() => {
    const row = db.select({ heartbeatAt: t.status.heartbeatAt }).from(t.status).where(eq(t.status.id, 1)).get();
    const down = Date.now() - (row ? Date.parse(row.heartbeatAt) : startedAt) > ENGINE_DOWN_MS;
    if (down && !alerted) {
      fetch(ntfy, { method: 'POST', body: 'Pitwall engine down. No heartbeat for over 60s.', headers: { Title: 'Pitwall', Priority: 'high' }, signal: AbortSignal.timeout(5_000) }).catch(() => {});
    }
    alerted = down;
  }, 10_000);
}

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: env.PORT }, (info) => console.log(`Pitwall API on http://127.0.0.1:${info.port}`));
