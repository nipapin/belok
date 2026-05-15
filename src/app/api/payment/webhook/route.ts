import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, withTransaction } from '@/lib/db';
import type { LoyaltyLevelRow, OrderRow } from '@/lib/types';

interface WebhookBody {
  event?: string;
  object?: {
    metadata?: { order_id?: string };
  };
}

interface OrderWithUserAndLoyalty extends OrderRow {
  user_totalSpent: number;
  user_loyaltyLevelId: string | null;
  ll_id: string | null;
  ll_cashbackPercent: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as WebhookBody | null;
    const event = body?.event;
    const orderId = body?.object?.metadata?.order_id;

    if (event === 'payment.succeeded') {
      if (!orderId) return NextResponse.json({ ok: true });

      const order = await queryOne<OrderWithUserAndLoyalty>(
        `SELECT
           o.*,
           u."totalSpent"     AS "user_totalSpent",
           u."loyaltyLevelId" AS "user_loyaltyLevelId",
           l."id"             AS "ll_id",
           l."cashbackPercent" AS "ll_cashbackPercent"
         FROM "orders" o
         JOIN "users" u ON u."id" = o."userId"
         LEFT JOIN "loyalty_levels" l ON l."id" = u."loyaltyLevelId"
         WHERE o.id = $1`,
        [orderId]
      );

      if (!order) return NextResponse.json({ ok: true });

      const cashbackPercent = order.ll_cashbackPercent ?? 3;
      const bonusEarned = Math.round(order.total * (cashbackPercent / 100));

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE "orders"
              SET "paymentStatus" = 'SUCCEEDED', status = 'CONFIRMED'
            WHERE id = $1`,
          [orderId]
        );

        if (bonusEarned > 0) {
          await client.query(
            `UPDATE "orders" SET "bonusEarned" = $1 WHERE id = $2`,
            [bonusEarned, orderId]
          );
          await client.query(
            `UPDATE "users"
                SET "bonusBalance" = "bonusBalance" + $1,
                    "totalSpent"   = "totalSpent" + $2
              WHERE id = $3`,
            [bonusEarned, order.total, order.userId]
          );
          await client.query(
            `INSERT INTO "bonus_transactions"
               (id, "userId", amount, type, "orderId", description)
             VALUES ($1, $2, $3, 'EARNED', $4, $5)`,
            [
              uuidv4(),
              order.userId,
              bonusEarned,
              orderId,
              `Кэшбэк ${cashbackPercent}% за заказ`,
            ]
          );

          const newTotalSpent = order.user_totalSpent + order.total;
          const nextLevel = await client.query<LoyaltyLevelRow>(
            `SELECT id FROM "loyalty_levels"
              WHERE "minSpent" <= $1
              ORDER BY "minSpent" DESC
              LIMIT 1`,
            [newTotalSpent]
          );
          const next = nextLevel.rows[0];
          if (next && next.id !== order.user_loyaltyLevelId) {
            await client.query(
              `UPDATE "users" SET "loyaltyLevelId" = $1 WHERE id = $2`,
              [next.id, order.userId]
            );
          }
        }
      });
    }

    if (event === 'payment.canceled') {
      if (!orderId) return NextResponse.json({ ok: true });

      const order = await queryOne<OrderRow>(
        `SELECT * FROM "orders" WHERE id = $1`,
        [orderId]
      );
      if (!order) return NextResponse.json({ ok: true });

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE "orders"
              SET "paymentStatus" = 'CANCELLED', status = 'CANCELLED'
            WHERE id = $1`,
          [orderId]
        );

        if (order.bonusUsed > 0) {
          await client.query(
            `UPDATE "users" SET "bonusBalance" = "bonusBalance" + $1 WHERE id = $2`,
            [order.bonusUsed, order.userId]
          );
          await client.query(
            `INSERT INTO "bonus_transactions"
               (id, "userId", amount, type, "orderId", description)
             VALUES ($1, $2, $3, 'EARNED', $4, $5)`,
            [uuidv4(), order.userId, order.bonusUsed, orderId, 'Возврат бонусов (отмена заказа)']
          );
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
