import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('belok-weather-migration'))");
  const applied = await client.query('SELECT name FROM _migrations WHERE name=$1', ['025_weather.sql']);
  if (!applied.rows.length) {
    await client.query(await readFile(new URL('./025_weather.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO _migrations(name) VALUES($1)', ['025_weather.sql']);
  }
  await client.query('COMMIT'); console.log('Weather migration ready');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
