import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import { queryOne, withTransaction } from '@/lib/db';
import { tryNotifyUser } from '@/lib/push';
import { getNotificationSettings } from '@/lib/notificationSettings';
import type { LoyaltyLevelRow, OrderRow, OrderStatus } from '@/lib/types';

interface OrderLoyaltyRow extends OrderRow {
  user_totalSpent: number;
  user_loyaltyLevelId: string | null;
  ll_cashbackPercent: number | null;
}

async function loadOrderForLoyalty(
  client: PoolClient,
  orderId: string
): Promise<OrderLoyaltyRow | null> {
  const result = await client.query<OrderLoyaltyRow>(
    `SELECT
       o.*,
       u."totalSpent"      AS "user_totalSpent",
       u."loyaltyLevelId"  AS "user_loyaltyLevelId",
       l."cashbackPercent" AS "ll_cashbackPercent"
     FROM "orders" o
     JOIN "users" u ON u."id" = o."userId"
     LEFT JOIN "loyalty_levels" l ON l."id" = u."loyaltyLevelId"
     WHERE o.id = $1
     FOR UPDATE OF o`,
    [orderId]
  );
  return result.rows[0] ?? null;
}

/**
 * When staff completes an order, award cashback and mark it paid.
 * When they cancel, refund bonuses spent at checkout.
 */
export async function settleOrderLoyalty(orderId: string, nextStatus: OrderStatus): Promise<void> {
  if (nextStatus !== 'COMPLETED' && nextStatus !== 'CANCELLED') return;

  let bonusEarned = 0;
  let cashbackPercent = 0;
  let userId: string | null = null;
  let leveledUpToId: string | null = null;

  await withTransaction(async (client) => {
    const order = await loadOrderForLoyalty(client, orderId);
    if (!order) return;
    userId = order.userId;

    if (nextStatus === 'COMPLETED') {
      await client.query(`UPDATE "orders" SET "paymentStatus" = 'SUCCEEDED' WHERE id = $1`, [
        orderId,
      ]);

      if (order.bonusEarned > 0) return;

      cashbackPercent = order.ll_cashbackPercent ?? 3;
      bonusEarned = Math.round(order.total * (cashbackPercent / 100));
      if (bonusEarned <= 0) return;

      await client.query(`UPDATE "orders" SET "bonusEarned" = $1 WHERE id = $2`, [
        bonusEarned,
        orderId,
      ]);
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
        await client.query(`UPDATE "users" SET "loyaltyLevelId" = $1 WHERE id = $2`, [
          next.id,
          order.userId,
        ]);
        leveledUpToId = next.id;
      }
      return;
    }

    if (order.paymentStatus === 'CANCELLED') return;

    await client.query(`UPDATE "orders" SET "paymentStatus" = 'CANCELLED' WHERE id = $1`, [
      orderId,
    ]);

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

  if (!userId) return;

  const settings = await getNotificationSettings();
  if (!settings.autoPushLoyalty) return;

  if (bonusEarned > 0) {
    void tryNotifyUser(userId, {
      title: `+${bonusEarned} ₽ бонусов`,
      body: `Кэшбэк ${cashbackPercent}% за заказ.`,
      url: '/profile/bonuses',
      tag: 'bonus',
    });
  }

  if (leveledUpToId) {
    const lvl = await queryOne<LoyaltyLevelRow>(
      `SELECT id, name, "minSpent", "cashbackPercent", "discountPercent", "sortOrder"
         FROM "loyalty_levels" WHERE id = $1`,
      [leveledUpToId]
    );
    if (lvl) {
      void tryNotifyUser(userId, {
        title: `Уровень «${lvl.name}» — ваш!`,
        body: `Кэшбэк ${lvl.cashbackPercent}% и скидка ${lvl.discountPercent}%.`,
        url: '/profile',
        tag: 'level-up',
      });
    }
  }
}
