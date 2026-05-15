import { Pool, type PoolClient, type QueryResultRow } from 'pg';

declare global {
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Configure a PostgreSQL connection string in .env (см. README → "База данных").'
    );
  }
  return new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
}

export const pool: Pool = globalThis.__pgPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__pgPool = pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<T[]> {
  const result = await pool.query<T>(text, params as unknown[] | undefined);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<T | null> {
  const result = await pool.query<T>(text, params as unknown[] | undefined);
  return result.rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* swallow rollback failure — original error is more important */
    }
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
