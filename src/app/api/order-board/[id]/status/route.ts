import { NextRequest, NextResponse, after } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { KioskUnauthorizedError, requireKioskUnlocked } from '@/lib/kioskAuth';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import { getNotificationSettings } from '@/lib/notificationSettings';
import { getPublicAppOrigin, tryNotifyUser } from '@/lib/push';
import type { OrderStatus } from '@/lib/types';

const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PREPARING: ['PENDING', 'CONFIRMED'],
  READY: ['PREPARING'],
  COMPLETED: ['READY'],
};
const notifications = {
  PREPARING: { title: 'Готовим ваш заказ', body: 'Шеф-повар уже приступил — будем готовы скоро.' },
  READY: { title: 'Заказ готов!', body: 'Можно забирать. Мы уже вас ждём.' },
  COMPLETED: { title: 'Заказ завершён', body: 'Спасибо за заказ!' },
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireKioskUnlocked();
    const { id } = await params;
    const body = await request.json().catch(() => null) as { status?: unknown } | null;
    const status = body?.status;
    if (status !== 'PREPARING' && status !== 'READY' && status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Недопустимый статус' }, { status: 400 });
    }
    // The conditional update prevents two screens from moving the same order
    // twice or resurrecting a cancelled/completed order.
    const rows = await query<{ id: string; status: OrderStatus; userId: string | null }>(
      `UPDATE "orders" SET status = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2 AND status::text = ANY($3::text[])
         AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kaliningrad')::date
             = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kaliningrad')::date
         AND ("paymentStatus" = 'SUCCEEDED' OR ("paymentStatus" = 'PENDING'
              AND ("paymentMethod" IN ('CASH', 'BONUS') OR "paymentMethod" IS NULL)))
       RETURNING id, status, "userId"`, [status, id, transitions[status]]
    );
    const order = rows[0];
    if (!order) {
      const current = await queryOne<{ status: OrderStatus }>('SELECT status FROM "orders" WHERE id = $1', [id]);
      return NextResponse.json({ error: current ? 'Заказ уже изменён на другом экране. Обновляем список.' : 'Заказ не найден' }, { status: current ? 409 : 404 });
    }
    let warning: string | undefined;
    try { await settleOrderLoyalty(id, status); }
    catch (error) {
      console.error('Kitchen order loyalty error:', error);
      warning = 'Статус изменён, но начисление бонусов не завершилось. Проверьте заказ в админке.';
    }
    after(async () => {
      try {
        if (order.userId && (await getNotificationSettings()).autoPushOrderStatus) {
          await tryNotifyUser(order.userId, { ...notifications[status], url: `${getPublicAppOrigin()}/orders/${id}`, tag: `order-${id}` });
        }
      } catch (error) { console.error('Kitchen order push error:', error); }
    });
    return NextResponse.json({ order: { id, status }, warning }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) return NextResponse.json({ error: 'Введите PIN кассы' }, { status: 401 });
    console.error('Kitchen order status error:', error);
    return NextResponse.json({ error: 'Не удалось изменить статус заказа' }, { status: 500 });
  }
}
