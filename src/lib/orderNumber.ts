import type { PoolClient } from 'pg';

export async function allocateOrderNumber(client: PoolClient): Promise<number> {
  const result = await client.query<{ dailyNumber: number }>(
    `UPDATE "order_counter"
     SET "lastNumber" = "lastNumber" + 1
     WHERE "id" = 1
     RETURNING "lastNumber" AS "dailyNumber"`
  );
  const row = result.rows[0];
  if (!row) throw new Error('Не удалось выдать номер заказа');
  return Number(row.dailyNumber);
}
