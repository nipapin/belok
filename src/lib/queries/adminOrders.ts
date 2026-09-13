import { query, queryOne } from '@/lib/db';
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

export async function fetchAdminOrderById(id: string) {
  const order = await queryOne<OrderRow & OrderUserRow>(
    `SELECT
       o.*,
       u."id"    AS "user_id",
       u."email" AS "user_email",
       u."phone" AS "user_phone",
       u."name"  AS "user_name"
     FROM "orders" o
     LEFT JOIN "users" u ON u."id" = o."userId"
     WHERE o.id = $1`,
    [id]
  );
  if (!order) return null;

  const items = await query<OrderItemRow>(
    `SELECT * FROM "order_items" WHERE "orderId" = $1 ORDER BY id ASC`,
    [id]
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
    ? await query<IngredientRow>(`SELECT * FROM "ingredients" WHERE id = ANY($1::text[])`, [
        ingredientIds,
      ])
    : [];

  const productMap = new Map(products.map((p) => [p.id, p]));
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  return {
    id: order.id,
    userId: order.userId,
    status: order.status,
    total: order.total,
    discountAmount: order.discountAmount,
    bonusUsed: order.bonusUsed,
    bonusEarned: order.bonusEarned,
    paymentStatus: order.paymentStatus,
    comment: order.comment,
    guestEmail: order.guestEmail,
    source: order.source,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    user: order.user_id
      ? {
          id: order.user_id,
          email: order.user_email,
          phone: order.user_phone,
          name: order.user_name,
        }
      : null,
    items: items.map((it) => ({
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
  };
}
