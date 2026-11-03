import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTransaction } from '@/lib/db';

let ready: Promise<void> | undefined;
/** Apply only our additive migration, never unrelated pending migrations. */
export function ensureTelegramSchema(): Promise<void> {
  if (!ready) ready = withTransaction(async client => {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('belok-telegram-schema'))");
    await client.query('CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const name = '031_telegram_orders.sql';
    const applied = await client.query('SELECT name FROM _migrations WHERE name=$1', [name]);
    if (!applied.rowCount) {
      await client.query(await readFile(join(process.cwd(), 'migrations', name), 'utf8'));
      await client.query('INSERT INTO _migrations(name) VALUES($1)', [name]);
    }
  }).catch(error => { ready = undefined; throw error; });
  return ready;
}
