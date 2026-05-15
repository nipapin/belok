import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import type {
  OrderItemRow,
  OrderRow,
  OrderStatus,
  ProductRow,
} from '@/lib/types';

const VALID_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
];

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

    await query(`UPDATE "orders" SET status = $1 WHERE id = $2`, [status, id]);

    const order = await queryOne<OrderRow & {
      user_id: string;
      user_phone: string | null;
      user_name: string | null;
    }>(
      `SELECT
         o.*,
         u."id"    AS "user_id",
         u."phone" AS "user_phone",
         u."name"  AS "user_name"
       FROM "orders" o
       JOIN "users" u ON u."id" = o."userId"
       WHERE o.id = $1`,
      [id]
    );

    if (!order) {
      return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    }

    const items = await query<OrderItemRow>(
      `SELECT * FROM "order_items" WHERE "orderId" = $1 ORDER BY id ASC`,
      [id]
    );
    const productIds = items.map((i) => i.productId);
    const products = productIds.length
      ? await query<ProductRow>(`SELECT * FROM "products" WHERE id = ANY($1::text[])`, [productIds])
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    return NextResponse.json({
      order: {
        id: order.id,
        userId: order.userId,
        status: order.status,
        total: order.total,
        discountAmount: order.discountAmount,
        bonusUsed: order.bonusUsed,
        bonusEarned: order.bonusEarned,
        paymentStatus: order.paymentStatus,
        paymentId: order.paymentId,
        comment: order.comment,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        user: { id: order.user_id, phone: order.user_phone, name: order.user_name },
        items: items.map((it) => ({
          ...it,
          product: productMap.get(it.productId) ?? null,
        })),
      },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}
