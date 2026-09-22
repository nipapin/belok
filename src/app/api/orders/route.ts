import { after, NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { notifyKitchenNewOrder } from '@/lib/orderNotify';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import { isTbankConfigured, SBP_MIN_RUBLES, TbankError } from '@/lib/tbank';
import { startTbankPayment } from '@/lib/tbankPayments';
import { allocateOrderNumber } from '@/lib/orderNumber';
import type {
  IngredientAction,
  OrderFulfillment,
  OrderItemCustomizationRow,
  OrderItemRow,
  OrderPaymentMethod,
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
      | {
          items?: IncomingItem[];
          bonusUsed?: number;
          comment?: string;
          fulfillment?: string;
          deliveryAddress?: string;
          deliveryTime?: string;
          contactPhone?: string;
          paymentMethod?: string;
        }
      | null;
    const items = body?.items ?? [];
    const bonusUsed = body?.bonusUsed ?? 0;
    const comment = body?.comment ?? null;
    const fulfillment = body?.fulfillment === 'DELIVERY' ? 'DELIVERY' : body?.fulfillment === 'PICKUP' ? 'PICKUP' : null;
    const deliveryAddress = typeof body?.deliveryAddress === 'string' ? body.deliveryAddress.trim() : '';
    const deliveryTime = typeof body?.deliveryTime === 'string' ? body.deliveryTime.trim() : '';
    const contactPhone = typeof body?.contactPhone === 'string' ? body.contactPhone.trim() : '';

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

    if (!fulfillment) {
      return NextResponse.json({ error: 'Выберите доставку или самовывоз' }, { status: 400 });
    }

    if (fulfillment === 'DELIVERY') {
      if (deliveryAddress.length < 5) {
        return NextResponse.json({ error: 'Укажите адрес доставки' }, { status: 400 });
      }
      if (!deliveryTime) {
        return NextResponse.json({ error: 'Укажите время доставки' }, { status: 400 });
      }
      if (contactPhone.replace(/\D/g, '').length < 10) {
        return NextResponse.json({ error: 'Укажите телефон для связи' }, { status: 400 });
      }
    }

    const requestedMethod = body?.paymentMethod;
    const paymentMethod: OrderPaymentMethod =
      total === 0
        ? 'BONUS'
        : requestedMethod === 'CASH' || requestedMethod === 'CARD' || requestedMethod === 'SBP'
          ? requestedMethod
          : 'SBP';
    if (
      total > 0 &&
      requestedMethod !== 'CASH' &&
      requestedMethod !== 'CARD' &&
      requestedMethod !== 'SBP'
    ) {
      return NextResponse.json({ error: 'Выберите способ оплаты' }, { status: 400 });
    }

    const needsBank = paymentMethod === 'CARD' || paymentMethod === 'SBP';
    if (needsBank && total > 0 && total < SBP_MIN_RUBLES) {
      return NextResponse.json(
        { error: `Онлайн-оплата принимает платежи от ${SBP_MIN_RUBLES} ₽. Спишите бонусы или добавьте товары.` },
        { status: 400 }
      );
    }
    if (needsBank && !isTbankConfigured()) {
      return NextResponse.json({ error: 'Онлайн-оплата не настроена' }, { status: 503 });
    }

    const fulfillmentValue: OrderFulfillment = fulfillment;

    const orderId = uuidv4();

    const dailyNumber = await withTransaction(async (client) => {
      const ticket = await allocateOrderNumber(client);
      await client.query(
        `INSERT INTO "orders"
          (id, "userId", total, "discountAmount", "bonusUsed", comment, "dailyNumber",
           fulfillment, "deliveryAddress", "deliveryTime", "contactPhone", "paymentMethod")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          orderId,
          user.id,
          total,
          discountAmount,
          actualBonusUsed,
          comment,
          ticket,
          fulfillmentValue,
          fulfillmentValue === 'DELIVERY' ? deliveryAddress : null,
          fulfillmentValue === 'DELIVERY' ? deliveryTime : null,
          fulfillmentValue === 'DELIVERY' ? contactPhone : null,
          paymentMethod,
        ]
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
      return ticket;
    });

    let paymentUrl: string | null = null;
    let paymentPayload: string | null = null;
    if (needsBank) {
      try {
        const payment = await startTbankPayment({
          id: orderId,
          total,
          dailyNumber,
          method: paymentMethod === 'CARD' ? 'card' : 'sbp',
        });
        paymentUrl = payment.paymentUrl;
        paymentPayload = payment.payload;
        if (!paymentUrl && !paymentPayload) {
          throw new Error('Т-Банк не вернул ссылку на оплату');
        }
      } catch (error) {
        console.error('Create T-Bank payment error:', error);
        await query(`UPDATE "orders" SET status = 'CANCELLED' WHERE id = $1`, [orderId]);
        await settleOrderLoyalty(orderId, 'CANCELLED');
        const message =
          error instanceof TbankError ? error.message : 'Не удалось создать платёж';
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    const order = await fetchOrderWithItems(orderId);

    if (!needsBank) {
      after(() => notifyKitchenNewOrder(orderId, request));
    }

    return NextResponse.json({
      order,
      payment: needsBank ? { paymentUrl, payload: paymentPayload } : null,
    });
  } catch (error) {
    console.error('Create order error:', error);
    return NextResponse.json({ error: 'Ошибка создания заказа' }, { status: 500 });
  }
}
