import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { KioskUnauthorizedError } from '@/lib/kioskAuth';
import { requireBoardAccess } from '@/lib/orderBoardAccess';
import type { OrderRow, OrderItemRow, OrderItemCustomizationRow } from '@/lib/types';
import { KIOSK_COOKIE } from '@/lib/kioskCookie';
import { formatVariantTitle } from '@/lib/productTitle';
import { orderItemGroups } from '@/lib/orderItemGroups';

export async function GET() {
  try {
    const access = await requireBoardAccess();
    // Online orders enter the kitchen only after payment; cash can be prepared immediately.
    const orders = await query<OrderRow>(
      `SELECT id, "dailyNumber", status, source, fulfillment, "paymentMethod",
              "paymentStatus", total, comment, "deliveryAddress", "deliveryTime", "createdAt"
       FROM "orders"
       WHERE status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY')
         AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kaliningrad')::date
             = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kaliningrad')::date
         AND (status = 'READY' OR "paymentStatus" = 'SUCCEEDED'
              OR ("paymentStatus" = 'PENDING' AND ("paymentMethod" IN ('CASH', 'BONUS') OR "paymentMethod" IS NULL)))
       ORDER BY "createdAt" DESC, "dailyNumber" DESC NULLS LAST, id DESC`
    );
    const orderIds = orders.map((order) => order.id);
    const items = orderIds.length ? await query<OrderItemRow & { name: string; preparedQuantity: number }>(
      `SELECT i.id, i."orderId", i."parentItemId", i.quantity, i."preparedQuantity", i."variantName", COALESCE(p.name, 'Блюдо удалено') AS name
       FROM "order_items" i LEFT JOIN "products" p ON p.id = i."productId"
       WHERE i."orderId" = ANY($1::text[]) ORDER BY i.id`, [orderIds]
    ) : [];
    const customizations = items.length ? await query<OrderItemCustomizationRow & { name: string }>(
      `SELECT c.id, c."orderItemId", c.action, COALESCE(c."ingredientName", i.name, 'Ингредиент удалён') AS name
       FROM "order_item_customizations" c LEFT JOIN "ingredients" i ON i.id = c."ingredientId"
       WHERE c."orderItemId" = ANY($1::text[]) ORDER BY c.id`, [items.map((item) => item.id)]
    ) : [];
    return NextResponse.json({
      orders: orders.map((order) => ({
        ...order,
        total: access.canComplete ? order.total : undefined,
        paymentStatus: access.canComplete ? order.paymentStatus : undefined,
        paymentMethod: access.canComplete ? order.paymentMethod : undefined,
        items: orderItemGroups(items.filter((item) => item.orderId === order.id)).map(({ item, toppings }) => ({
          id: item.id, name: formatVariantTitle(item.name, item.variantName), quantity: item.quantity, preparedQuantity: item.preparedQuantity,
          customizations: [...customizations.filter((c) => c.orderItemId === item.id)
            .map((c) => ({ id: c.id, action: c.action, name: c.name })), ...toppings.map((topping) => ({ id:topping.id,action:'ADD',name:formatVariantTitle(topping.name,topping.variantName) }))],
        })),
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) {
      return NextResponse.json({ error: 'Введите PIN кассы' }, { status: 401 });
    }
    console.error('Order board error:', error);
    return NextResponse.json({ error: 'Не удалось загрузить заказы' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ unlocked: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  response.cookies.set(KIOSK_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
