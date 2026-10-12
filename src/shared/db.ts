import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function openDb(file: string) {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle({ client: sqlite });
  // The engine and API open the same fresh file at once on first boot. The WAL
  // switch skips the busy handler, and drizzle reads its journal outside the
  // migration transaction, so either can lose the race. Both are idempotent.
  for (let attempt = 1; ; attempt++) {
    try {
      sqlite.pragma('journal_mode = WAL');
      migrate(db, { migrationsFolder });
      return db;
    } catch (err) {
      if (attempt === 5) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * attempt);
    }
  }
}

export type Db = ReturnType<typeof openDb>;
