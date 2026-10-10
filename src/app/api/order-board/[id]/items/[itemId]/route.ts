import { NextRequest, NextResponse, after } from 'next/server';
import { withTransaction } from '@/lib/db';
import { KioskUnauthorizedError, requireKioskUnlocked } from '@/lib/kioskAuth';
import { getNotificationSettings } from '@/lib/notificationSettings';
import { getPublicAppOrigin, tryNotifyUser } from '@/lib/push';
import type { OrderStatus } from '@/lib/types';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    await requireKioskUnlocked();
    const { id, itemId } = await params;
    const body = await request.json().catch(() => null) as { action?: unknown; preparedQuantity?: unknown } | null;
    const expected = body?.preparedQuantity;
    if ((body?.action !== 'prepare' && body?.action !== 'undo') || typeof expected !== 'number'
        || !Number.isSafeInteger(expected) || expected < 0 || expected > 2_147_483_647) {
      return NextResponse.json({ error: 'Недопустимая отметка позиции' }, { status: 400 });
    }
    const delta = body.action === 'prepare' ? 1 : -1;
    const result = await withTransaction(async (client) => {
      // Serialize against order status changes and other screens. The expected
      // count also makes a retry/double click safe: it cannot mark two units.
      const order = await client.query<{ id: string; status: OrderStatus; userId: string | null }>(
        `SELECT id, status, "userId" FROM "orders" WHERE id = $1
          AND status IN ('CONFIRMED', 'PREPARING', 'READY')
          AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kaliningrad')::date
              = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kaliningrad')::date
          AND ("paymentStatus" = 'SUCCEEDED' OR ("paymentStatus" = 'PENDING'
               AND ("paymentMethod" IN ('CASH', 'BONUS') OR "paymentMethod" IS NULL)))
          FOR UPDATE`, [id],
      );
      if (!order.rowCount) return null;
      const item = await client.query<{ id: string; preparedQuantity: number }>(
        `UPDATE "order_items" SET "preparedQuantity" = "preparedQuantity" + $3
          WHERE id = $1 AND "orderId" = $2 AND "preparedQuantity" = $4
            AND "preparedQuantity" + $3 BETWEEN 0 AND quantity
          RETURNING id, "preparedQuantity"`, [itemId, id, delta, expected],
      );
      if (!item.rows[0]) return null;
      const current = order.rows[0];
      let status = current.status;
      if (delta === 1 && status !== 'READY') {
        const unfinished = await client.query('SELECT id FROM "order_items" WHERE "orderId" = $1 AND "preparedQuantity" < quantity LIMIT 1', [id]);
        if (!unfinished.rowCount) status = 'READY';
      } else if (delta === -1 && status === 'READY') {
        status = 'PREPARING';
      }
      if (status !== current.status) {
        await client.query('UPDATE "orders" SET status = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1', [id, status]);
      }
      return { item: item.rows[0], order: { id, status }, becameReady: status === 'READY' && current.status !== 'READY', userId: current.userId };
    });
    if (!result) return NextResponse.json({ error: 'Заказ или позиция уже изменены. Обновляем список.' }, { status: 409 });
    if (result.becameReady && result.userId) {
      after(async () => {
        try {
          if ((await getNotificationSettings()).autoPushOrderStatus) {
            await tryNotifyUser(result.userId!, { title: 'Заказ готов!', body: 'Можно забирать. Мы уже вас ждём.', url: `${getPublicAppOrigin()}/orders/${id}`, tag: `order-${id}` });
          }
        } catch (error) { console.error('Kitchen order push error:', error); }
      });
    }
    return NextResponse.json({ item: result.item, order: result.order }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) return NextResponse.json({ error: 'Введите PIN кассы' }, { status: 401 });
    console.error('Kitchen item progress error:', error);
    return NextResponse.json({ error: 'Не удалось отметить позицию' }, { status: 500 });
  }
}
