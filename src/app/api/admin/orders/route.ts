import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import type {
  IngredientRow,
  OrderItemCustomizationRow,
  OrderItemRow,
  OrderRow,
  ProductRow,
} from '@/lib/types';

interface OrderUserRow {
  user_id: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_name: string | null;
}

export async function GET() {
  try {
    await requireAdmin();

    const orders = await query<OrderRow & OrderUserRow>(
      `SELECT
         o.*,
         u."id"    AS "user_id",
         u."email" AS "user_email",
         u."phone" AS "user_phone",
         u."name"  AS "user_name"
       FROM "orders" o
       LEFT JOIN "users" u ON u."id" = o."userId"
       ORDER BY o."createdAt" DESC`
    );

    if (orders.length === 0) return NextResponse.json({ orders: [] });

    const orderIds = orders.map((o) => o.id);

    const items = await query<OrderItemRow>(
      `SELECT * FROM "order_items" WHERE "orderId" = ANY($1::text[]) ORDER BY id ASC`,
      [orderIds]
    );
    const itemIds = items.map((i) => i.id);
    const productIds = Array.from(new Set(items.map((i) => i.productId)));

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

    const ingredientIds = Array.from(new Set(customizations.map((c) => c.ingredientId)));
    const ingredients = ingredientIds.length
      ? await query<IngredientRow>(
          `SELECT * FROM "ingredients" WHERE id = ANY($1::text[])`,
          [ingredientIds]
        )
      : [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

    const result = orders.map((o) => ({
      id: o.id,
      userId: o.userId,
      status: o.status,
      total: o.total,
      discountAmount: o.discountAmount,
      bonusUsed: o.bonusUsed,
      bonusEarned: o.bonusEarned,
      paymentStatus: o.paymentStatus,
      fulfillment: o.fulfillment,
      deliveryAddress: o.deliveryAddress,
      deliveryTime: o.deliveryTime,
      contactPhone: o.contactPhone,
      paymentMethod: o.paymentMethod,
      comment: o.comment,
      guestEmail: o.guestEmail,
      source: o.source,
      dailyNumber: o.dailyNumber,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      user: o.user_id
        ? {
            id: o.user_id,
            email: o.user_email,
            phone: o.user_phone,
            name: o.user_name,
          }
        : null,
      items: items
        .filter((it) => it.orderId === o.id)
        .map((it) => ({
          ...it,
          product: productMap.get(it.productId) ?? null,
          customizations: customizations
            .filter((c) => c.orderItemId === it.id)
            .map((c) => {
              const ingredient = ingredientMap.get(c.ingredientId);
              return {
                ...c,
                ingredient: ingredient
                  ? { id: ingredient.id, name: ingredient.name, price: ingredient.price }
                  : null,
              };
            }),
        })),
    }));

    return NextResponse.json({ orders: result });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Get admin orders error:', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
