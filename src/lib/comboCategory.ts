import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

/** Resolve the dedicated menu category without changing existing categories. */
export async function ensureComboCategory(client: PoolClient): Promise<string> {
  // Prevent concurrent first-time combo creation from duplicating the category.
  await client.query('SELECT pg_advisory_xact_lock($1)', [48625371]);
  const found = await client.query<{id: string}>(`SELECT id FROM categories WHERE lower(trim(name)) = lower('Комбо') ORDER BY "createdAt" ASC LIMIT 1`);
  if (found.rows[0]) return found.rows[0].id;
  const result = await client.query<{id:string}>(`INSERT INTO categories(id,name,"sortOrder","isActive")
    VALUES ($1,'Комбо',(SELECT COALESCE(MAX("sortOrder"),-1)+1 FROM categories),true) RETURNING id`,[randomUUID()]);
  return result.rows[0].id;
}
