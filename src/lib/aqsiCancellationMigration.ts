import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTransaction } from '@/lib/db';

/** Apply only the additive cancellation column before candidate readiness. */
export async function applyAqsiCancellationMigration() {
  const name='031_aqsi_cash_cancellation.sql';
  await withTransaction(async client=>{
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '40s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('belok-aqsi-cancellation'))");
    await client.query('CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    if(!(await client.query('SELECT name FROM _migrations WHERE name=$1',[name])).rowCount) {
      await client.query(await readFile(join(process.cwd(),'migrations',name),'utf8'));
      await client.query('INSERT INTO _migrations(name) VALUES($1)',[name]);
    }
    await client.query('SELECT "cancelRequested" FROM aqsi_cash_orders LIMIT 0');
  });
}
