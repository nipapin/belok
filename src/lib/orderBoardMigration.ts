import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTransaction } from '@/lib/db';

const migration = '029_order_board_indexes.sql';
const indexes = ['orders_board_paid_createdAt_idx', 'order_items_orderId_id_idx', 'order_item_customizations_orderItemId_id_idx'];

/** Only the approved additive board migration, before deployment readiness. */
export async function applyOrderBoardIndexes() {
  await withTransaction(async client => {
    // Bound lock acquisition and each index build; receiver readiness also has
    // an overall deadline and keeps the previous release on failure.
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '40s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('belok-order-board-indexes'))");
    await client.query('CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const applied = await client.query('SELECT name FROM _migrations WHERE name=$1', [migration]);
    if (!applied.rowCount) {
      const sql = await readFile(join(process.cwd(), 'migrations', migration), 'utf8');
      // This fixed migration contains three plain CREATE INDEX statements.
      for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
        await client.query(statement);
      }
    }
    const valid = await client.query<{ name: string }>(`SELECT c.relname AS name FROM pg_index i
      JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND i.indisvalid AND i.indisready`, [indexes]);
    if (valid.rowCount !== indexes.length) throw new Error('Order board indexes are missing or invalid');
    await client.query('INSERT INTO _migrations(name) VALUES($1) ON CONFLICT(name) DO NOTHING', [migration]);
  });
  console.info('Order board migration 029 verified');
}
