import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { tryNotifyUser, absolutePushUrl } from '@/lib/push';
import { getNotificationSettings } from '@/lib/notificationSettings';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import { fetchAdminOrderById } from '@/lib/queries/adminOrders';
import { isTbankAlreadyVoided, tbankCancel, TbankError } from '@/lib/tbank';
import type { OrderStatus, PaymentStatus } from '@/lib/types';
import { cancelAqsiCard } from '@/lib/aqsiJobs';

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
    const before = await queryOne<{
      status: OrderStatus;
      userId: string | null;
      tbankPaymentId: string | null;
      paymentStatus: PaymentStatus;
      paymentMethod:string|null;
      source:string;
    }>(`SELECT status, "userId", "tbankPaymentId", "paymentStatus", "paymentMethod",source FROM "orders" WHERE id = $1`, [id]);

    if (before?.source==='KIOSK' && before.paymentMethod==='CARD') {
      if (before.paymentStatus==='PENDING') {
        if(status==='CANCELLED') await cancelAqsiCard(id);
        return NextResponse.json({error:'Дождитесь подтверждения оплаты или отмены от aQsi'},{status:409});
      }
      if(status==='CANCELLED' && before.paymentStatus==='SUCCEEDED') {
        return NextResponse.json({error:'Оплата прошла на aQsi. Сначала оформите возврат на кассе; автоматический возврат aQsi пока не подключён.'},{status:409});
      }
    }

    if (
      status === 'CANCELLED' &&
      before?.tbankPaymentId &&
      before.paymentStatus === 'SUCCEEDED'
    ) {
      try {
        const refund = await tbankCancel(before.tbankPaymentId);
        if (!refund.Success && !isTbankAlreadyVoided(refund)) {
          return NextResponse.json(
            { error: refund.Message || 'Не удалось вернуть оплату в Т-Банке' },
            { status: 400 }
          );
        }
      } catch (error) {
        console.error('T-Bank Cancel failed:', error);
        const message =
          error instanceof TbankError ? error.message : 'Не удалось вернуть оплату в Т-Банке';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    await query(`UPDATE "orders" SET status = $1 WHERE id = $2`, [status, id]);

    if (before && before.status !== status) {
      try {
        await settleOrderLoyalty(id, status as OrderStatus);
      } catch (loyaltyError) {
        console.error('Order loyalty settlement failed:', loyaltyError);
      }

      const tpl = STATUS_PUSH[status as OrderStatus];
      if (tpl && before.userId && (await getNotificationSettings()).autoPushOrderStatus) {
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
