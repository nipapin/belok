import { query } from '@/lib/db';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import type { OrderStatus } from '@/lib/types';

/**
 * Attach kiosk guest orders (left with this email) to the newly verified user
 * and award cashback for any that were already completed as a guest.
 */
export async function claimKioskOrdersForEmail(userId: string, email: string): Promise<void> {
  const claimed = await query<{ id: string; status: OrderStatus }>(
    `UPDATE "orders"
        SET "userId" = $1
      WHERE "guestEmail" = $2 AND "userId" IS NULL
      RETURNING id, status`,
    [userId, email]
  );

  for (const order of claimed) {
    if (order.status !== 'COMPLETED') continue;
    try {
      await settleOrderLoyalty(order.id, 'COMPLETED');
    } catch (error) {
      console.error('Kiosk claim loyalty failed:', error);
    }
  }
}
