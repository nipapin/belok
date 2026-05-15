import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { createPayment } from '@/lib/yookassa';
import { brandMark } from '@/lib/brand';
import type {
  IngredientAction,
  OrderItemCustomizationRow,
  OrderItemRow,
  OrderRow,
  ProductRow,
} from '@/lib/types';

interface OrderItemWithRelations extends OrderItemRow {
  product: ProductRow;
  customizations: OrderItemCustomizationRow[];
}

interface OrderWithItems extends OrderRow {
  items: OrderItemWithRelations[];
}

async function fetchOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const order = await queryOne<OrderRow>(
    `SELECT * FROM "orders" WHERE id = $1`,
    [orderId]
  );
  if (!order) return null;

  const items = await query<OrderItemRow>(
    `SELECT * FROM "order_items" WHERE "orderId" = $1 ORDER BY id ASC`,
    [orderId]
  );
  if (items.length === 0) return { ...order, items: [] };

  const productIds = items.map((i) => i.productId);
  const itemIds = items.map((i) => i.id);

  const products = await query<ProductRow>(
    `SELECT * FROM "products" WHERE id = ANY($1::text[])`,
    [productIds]
  );
  const productMap = new Map(products.map((p) => [p.id, p]));

  const customizations = await query<OrderItemCustomizationRow>(
    `SELECT * FROM "order_item_customizations" WHERE "orderItemId" = ANY($1::text[])`,
    [itemIds]
  );

  return {
    ...order,
    items: items.map((it) => ({
      ...it,
      product: productMap.get(it.productId) as ProductRow,
      customizations: customizations.filter((c) => c.orderItemId === it.id),
    })),
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const orders = await query<OrderRow>(
      `SELECT * FROM "orders" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
      [user.id]
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

    const productMap = new Map(products.map((p) => [p.id, p]));
    const ordersWithItems: OrderWithItems[] = orders.map((o) => ({
      ...o,
      items: items
        .filter((it) => it.orderId === o.id)
        .map((it) => ({
          ...it,
          product: productMap.get(it.productId) as ProductRow,
          customizations: customizations.filter((c) => c.orderItemId === it.id),
        })),
    }));

    return NextResponse.json({ orders: ordersWithItems });
  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

interface IncomingItem {
  productId: string;
  quantity: number;
  customizations?: { ingredientId: string; action: IngredientAction; priceDelta?: number }[];
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { items?: IncomingItem[]; bonusUsed?: number; comment?: string }
      | null;
    const items = body?.items ?? [];
    const bonusUsed = body?.bonusUsed ?? 0;
    const comment = body?.comment ?? null;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Корзина пуста' }, { status: 400 });
    }

    const productIds = items.map((i) => i.productId);
    const products = await query<ProductRow>(
      `SELECT * FROM "products" WHERE id = ANY($1::text[])`,
      [productIds]
    );
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const computedItems = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      const extras = (item.customizations || [])
        .filter((c) => c.action === 'ADD')
        .reduce((s, c) => s + (c.priceDelta || 0), 0);
      const unitPrice = product.price + extras;
      subtotal += unitPrice * item.quantity;
      return { ...item, unitPrice };
    });

    const discountPercent = user.loyaltyLevel?.discountPercent || 0;
    const discountAmount = Math.round(subtotal * (discountPercent / 100));
    const afterDiscount = subtotal - discountAmount;
    const actualBonusUsed = Math.min(
      Math.max(0, Math.floor(bonusUsed)),
      afterDiscount,
      user.bonusBalance
    );
    const total = afterDiscount - actualBonusUsed;

    const orderId = uuidv4();

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO "orders"
          (id, "userId", total, "discountAmount", "bonusUsed", comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, user.id, total, discountAmount, actualBonusUsed, comment]
      );

      for (const item of computedItems) {
        const itemId = uuidv4();
        await client.query(
          `INSERT INTO "order_items" (id, "orderId", "productId", quantity, "unitPrice")
           VALUES ($1, $2, $3, $4, $5)`,
          [itemId, orderId, item.productId, item.quantity, item.unitPrice]
        );
        for (const c of item.customizations || []) {
          await client.query(
            `INSERT INTO "order_item_customizations"
              (id, "orderItemId", "ingredientId", action, "priceDelta")
             VALUES ($1, $2, $3, $4, $5)`,
            [uuidv4(), itemId, c.ingredientId, c.action, c.priceDelta || 0]
          );
        }
      }

      if (actualBonusUsed > 0) {
        await client.query(
          `UPDATE "users" SET "bonusBalance" = "bonusBalance" - $1 WHERE id = $2`,
          [actualBonusUsed, user.id]
        );
        await client.query(
          `INSERT INTO "bonus_transactions"
             (id, "userId", amount, type, "orderId", description)
           VALUES ($1, $2, $3, 'SPENT', $4, $5)`,
          [uuidv4(), user.id, -actualBonusUsed, orderId, 'Списание бонусов за заказ']
        );
      }
    });

    let paymentUrl: string | null = null;
    try {
      const payment = await createPayment({
        amount: total,
        orderId,
        description: `Заказ №${orderId.slice(0, 8)} — ${brandMark}`,
        returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/orders/${orderId}`,
      });

      await query(`UPDATE "orders" SET "paymentId" = $1 WHERE id = $2`, [payment.id, orderId]);
      paymentUrl = payment.confirmation?.confirmation_url ?? null;
    } catch (paymentError) {
      console.error('Payment creation failed:', paymentError);
    }

    const order = await fetchOrderWithItems(orderId);

    return NextResponse.json({ order, paymentUrl });
  } catch (error) {
    console.error('Create order error:', error);
    return NextResponse.json({ error: 'Ошибка создания заказа' }, { status: 500 });
  }
}
