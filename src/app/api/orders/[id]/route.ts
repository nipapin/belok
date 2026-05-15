import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type {
  OrderItemCustomizationRow,
  OrderItemRow,
  OrderRow,
  ProductRow,
} from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const { id } = await params;

    const order = await queryOne<OrderRow>(
      `SELECT * FROM "orders" WHERE id = $1`,
      [id]
    );

    if (!order) {
      return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    }

    if (order.userId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    }

    const items = await query<OrderItemRow>(
      `SELECT * FROM "order_items" WHERE "orderId" = $1 ORDER BY id ASC`,
      [id]
    );

    const productIds = items.map((i) => i.productId);
    const itemIds = items.map((i) => i.id);

    const [products, customizations] = await Promise.all([
      productIds.length
        ? query<ProductRow>(`SELECT * FROM "products" WHERE id = ANY($1::text[])`, [productIds])
        : Promise.resolve([] as ProductRow[]),
      itemIds.length
        ? query<OrderItemCustomizationRow>(
            `SELECT * FROM "order_item_customizations" WHERE "orderItemId" = ANY($1::text[])`,
            [itemIds]
          )
        : Promise.resolve([] as OrderItemCustomizationRow[]),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));

    return NextResponse.json({
      order: {
        ...order,
        items: items.map((it) => ({
          ...it,
          product: productMap.get(it.productId) ?? null,
          customizations: customizations.filter((c) => c.orderItemId === it.id),
        })),
      },
    });
  } catch (error) {
    console.error('Get order error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
