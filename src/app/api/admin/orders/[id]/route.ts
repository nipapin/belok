import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { tryNotifyUser, absolutePushUrl } from '@/lib/push';
import { getNotificationSettings } from '@/lib/notificationSettings';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import { fetchAdminOrderById } from '@/lib/queries/adminOrders';
import type { OrderStatus } from '@/lib/types';

// Texts shown to the customer when their order changes status.
// Map only the events that are interesting to the user — PENDING is the
// status set at creation, no need to notify the customer that they themselves
// just placed an order.
const STATUS_PUSH: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  CONFIRMED: {
    title: 'Заказ подтверждён',
    body: 'Мы приняли ваш заказ и скоро начнём готовить.',
  },
  PREPARING: {
    title: 'Готовим ваш заказ',
    body: 'Шеф-повар уже приступил — будем готовы скоро.',
  },
  READY: {
    title: 'Заказ готов!',
    body: 'Можно забирать. Мы уже вас ждём.',
  },
  COMPLETED: {
    title: 'Заказ завершён',
    body: 'Спасибо! Бонусы за этот заказ уже на счёте.',
  },
  CANCELLED: {
    title: 'Заказ отменён',
    body: 'Заказ был отменён. Если списывали бонусы — они вернулись.',
  },
};

const VALID_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
];

function unauthorizedOrServerError(e: unknown, fallback: string) {
  if ((e as Error).message === 'UNAUTHORIZED')
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const order = await fetchAdminOrderById(id);
    if (!order) {
      return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (e) {
    return unauthorizedOrServerError(e, 'Ошибка загрузки');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
    const status = body?.status;

    if (typeof status !== 'string' || !VALID_STATUSES.includes(status as OrderStatus)) {
      return NextResponse.json({ error: 'Невалидный статус' }, { status: 400 });
    }

    // Read the previous status so we don't push if the admin re-saves the
    // same status (or for some flow that just refreshes the row).
    const before = await queryOne<{ status: OrderStatus; userId: string }>(
      `SELECT status, "userId" FROM "orders" WHERE id = $1`,
      [id]
    );

    await query(`UPDATE "orders" SET status = $1 WHERE id = $2`, [status, id]);

    if (before && before.status !== status) {
      try {
        await settleOrderLoyalty(id, status as OrderStatus);
      } catch (loyaltyError) {
        console.error('Order loyalty settlement failed:', loyaltyError);
      }

      const tpl = STATUS_PUSH[status as OrderStatus];
      if (tpl && (await getNotificationSettings()).autoPushOrderStatus) {
        void tryNotifyUser(before.userId, {
          title: tpl.title,
          body: tpl.body,
          url: absolutePushUrl(`/orders/${id}`, request),
          tag: `order-${id}`,
        });
      }
    }

    const order = await fetchAdminOrderById(id);
    if (!order) {
      return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (e) {
    return unauthorizedOrServerError(e, 'Ошибка обновления');
  }
}
