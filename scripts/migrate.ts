import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Configure it in .env first.');
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  const migrationsDir = resolve(process.cwd(), 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found in', migrationsDir);
    await pool.end();
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "name" TEXT PRIMARY KEY,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const applied = await pool.query<{ name: string }>('SELECT name FROM "_migrations"');
  const appliedSet = new Set(applied.rows.map((r) => r.name));

  let appliedCount = 0;

  for (const name of files) {
    if (appliedSet.has(name)) {
      console.log(`✓ skip   ${name} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, name), 'utf8');
    console.log(`→ apply  ${name}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO "_migrations"("name") VALUES ($1)', [name]);
      await client.query('COMMIT');
      appliedCount++;
      console.log(`✓ done   ${name}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`✗ failed ${name}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`\nMigrations applied: ${appliedCount} (skipped: ${files.length - appliedCount})`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
