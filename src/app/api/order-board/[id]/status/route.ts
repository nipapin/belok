import { NextRequest, NextResponse, after } from 'next/server';
import { query, queryOne, withTransaction } from '@/lib/db';
import { KioskUnauthorizedError } from '@/lib/kioskAuth';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import { getNotificationSettings } from '@/lib/notificationSettings';
import { getPublicAppOrigin, tryNotifyUser } from '@/lib/push';
import { requireBoardAccess } from '@/lib/orderBoardAccess';
import { boardTodaySql } from '@/lib/orderBoardQuery';
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
    const access = await requireBoardAccess();
    const { id } = await params;
    const body = await request.json().catch(() => null) as { status?: unknown; confirmCash?: unknown } | null;
    const status = body?.status;
    if (body?.confirmCash !== undefined && typeof body.confirmCash !== 'boolean') {
      return NextResponse.json({ error: 'Некорректное подтверждение оплаты' }, { status: 400 });
    }
    const confirmCash = body?.confirmCash === true;
    if (confirmCash && !access.canComplete) return NextResponse.json({ error: 'Подтверждение наличных доступно кассиру и управляющему' }, { status: 403 });
    if (confirmCash && status !== 'PREPARING') return NextResponse.json({ error: 'Подтвердите наличные при приёме заказа' }, { status: 400 });
    if (status !== 'PREPARING' && status !== 'READY' && status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Недопустимый статус' }, { status: 400 });
    }
    if (status === 'COMPLETED' && !access.canComplete) return NextResponse.json({error:'Выдача доступна кассиру и управляющему'},{status:403});
    // The conditional update prevents two screens from moving the same order
    // twice or resurrecting a cancelled/completed order.
    type UpdatedOrder = { id: string; status: OrderStatus; userId: string | null; paymentStatus: string; total: number };
    const sql = `UPDATE "orders" SET status = $1::"OrderStatus", "updatedAt" = CURRENT_TIMESTAMP,
         "paymentStatus" = CASE WHEN $4::boolean THEN 'SUCCEEDED'::"PaymentStatus" ELSE "paymentStatus" END
       WHERE id = $2 AND status::text = ANY($3::text[])
         AND ${boardTodaySql}
         AND ("paymentStatus" = 'SUCCEEDED' OR ($4::boolean AND "paymentMethod" = 'CASH' AND "paymentStatus" = 'PENDING'))
         AND (NOT $4::boolean OR ("paymentMethod" = 'CASH' AND NOT EXISTS (
           SELECT 1 FROM aqsi_jobs j WHERE j."orderId" = orders.id AND j.kind = 'CARD' AND j.state <> 'FAILED'
         )))
       RETURNING id, status, "userId", "paymentStatus", total`;
    const values = [status, id, transitions[status], confirmCash];
    const rows = confirmCash ? await withTransaction(async client => {
      const result = await client.query<UpdatedOrder>(sql, values);
      if (result.rows[0]) {
        // A staff attestation, not a terminal receipt. Do not submit another
        // acquiring operation or fiscal receipt; aQsi keeps its existing job.
        await client.query(`INSERT INTO app_settings(key,value) VALUES($1,$2::jsonb)
          ON CONFLICT(key) DO NOTHING`, ['cash_payment:' + id, JSON.stringify({
          orderId: id, actorId: access.user?.id ?? null, source: access.user ? 'STAFF' : 'KIOSK_PIN',
          amount: Number(result.rows[0].total), confirmedAt: new Date().toISOString(),
        })]);
      }
      return result.rows;
    }) : await query<UpdatedOrder>(sql, values);
    const order = rows[0];
    if (!order) {
      const current = await queryOne<{ status: OrderStatus }>('SELECT status FROM "orders" WHERE id = $1', [id]);
      return NextResponse.json({ error: current ? (confirmCash ? 'Заказ изменён или карточная операция требует сверки. Обновляем список.' : 'Заказ уже изменён на другом экране. Обновляем список.') : 'Заказ не найден' }, { status: current ? 409 : 404 });
    }
    let warning: string | undefined;
    // Dispatching an order never proves payment; do not mark unpaid orders paid or award cashback.
    try { if (status !== 'COMPLETED' || order.paymentStatus === 'SUCCEEDED') await settleOrderLoyalty(id, status); }
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
    return NextResponse.json({ order: { id, status, paymentStatus: access.canComplete ? order.paymentStatus : undefined, requiresCashConfirmation: false, awaitingPayment: false }, warning }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) return NextResponse.json({ error: 'Введите PIN кассы' }, { status: 401 });
    console.error('Kitchen order status error:', error);
    return NextResponse.json({ error: 'Не удалось изменить статус заказа' }, { status: 500 });
  }
}
