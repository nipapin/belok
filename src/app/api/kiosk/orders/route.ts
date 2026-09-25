import { after, NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '@/lib/db';
import { getUserWithLoyaltyById } from '@/lib/auth';
import { sendKioskInvite } from '@/lib/email';
import { KioskUnauthorizedError, requireKioskUnlocked } from '@/lib/kioskAuth';
import { allocateOrderNumber } from '@/lib/orderNumber';
import { notifyKitchenNewOrder } from '@/lib/orderNotify';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import { getPublicAppOrigin } from '@/lib/push';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';
import { isTbankConfigured, SBP_MIN_RUBLES, TbankError } from '@/lib/tbank';
import { startTbankPayment } from '@/lib/tbankPayments';
import { isValidEmail, normalizeEmail } from '@/lib/verificationCode';
import type {
  IngredientAction,
  OrderItemCustomizationRow,
  OrderItemRow,
  OrderRow,
  ProductRow,
  UserRow,
} from '@/lib/types';

interface IncomingItem {
  productId: string;
  quantity: number;
  customizations?: { ingredientId: string; action: IngredientAction; priceDelta?: number }[];
}

interface OrderItemWithRelations extends OrderItemRow {
  product: ProductRow;
  customizations: OrderItemCustomizationRow[];
}

interface OrderWithItems extends OrderRow {
  items: OrderItemWithRelations[];
}

async function fetchOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const order = await queryOne<OrderRow>(`SELECT * FROM "orders" WHERE id = $1`, [orderId]);
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

function kioskRegisterUrl(email: string): string {
  const origin = getPublicAppOrigin();
  const params = new URLSearchParams({
    auth: '1',
    register: '1',
    email,
  });
  return `${origin}/?${params.toString()}`;
}

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const limited = rateLimit(`kiosk-order:${ip}`, 20, 60);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: `Слишком много запросов. Попробуйте через ${limited.retryAfterSec} с` },
      { status: 429 }
    );
  }

  try {
    await requireKioskUnlocked();

    const body = (await request.json().catch(() => null)) as
      | { items?: IncomingItem[]; email?: unknown; comment?: unknown; paymentMethod?: unknown }
      | null;
    const items = body?.items ?? [];
    const comment = typeof body?.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;
    const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Корзина пуста' }, { status: 400 });
    }

    let guestEmail: string | null = null;
    let userId: string | null = null;
    let discountPercent = 0;

    if (emailRaw) {
      if (!isValidEmail(emailRaw)) {
        return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
      }
      guestEmail = normalizeEmail(emailRaw);
      const existing = await queryOne<UserRow>(`SELECT * FROM "users" WHERE email = $1`, [guestEmail]);
      if (existing) {
        userId = existing.id;
        const full = await getUserWithLoyaltyById(existing.id);
        discountPercent = full?.loyaltyLevel?.discountPercent || 0;
      }
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
      if (!product.isAvailable) throw new Error(`Product ${item.productId} unavailable`);
      const quantity = Math.max(1, Math.floor(item.quantity) || 1);
      const extras = (item.customizations || [])
        .filter((c) => c.action === 'ADD')
        .reduce((s, c) => s + (c.priceDelta || 0), 0);
      const unitPrice = product.price + extras;
      subtotal += unitPrice * quantity;
      return { ...item, quantity, unitPrice };
    });

    const discountAmount = Math.round(subtotal * (discountPercent / 100));
    const total = subtotal - discountAmount;
    const requestedMethod = body?.paymentMethod === 'CASH' || body?.paymentMethod === 'SBP' ? body.paymentMethod : null;
    if (total > 0 && !requestedMethod) {
      return NextResponse.json({ error: 'Выберите наличные или QR-код' }, { status: 400 });
    }
    const needsBank = total > 0 && requestedMethod === 'SBP';
    if (needsBank && total < SBP_MIN_RUBLES) {
      return NextResponse.json(
        { error: `Онлайн-оплата принимает платежи от ${SBP_MIN_RUBLES} ₽` },
        { status: 400 }
      );
    }
    if (needsBank && !isTbankConfigured()) {
      return NextResponse.json({ error: 'Онлайн-оплата не настроена' }, { status: 503 });
    }

    const orderId = uuidv4();
    const paymentMethod = !requestedMethod || total === 0 ? 'BONUS' : requestedMethod;

    const dailyNumber = await withTransaction(async (client) => {
      const ticket = await allocateOrderNumber(client);
      await client.query(
        `INSERT INTO "orders"
          (id, "userId", total, "discountAmount", "bonusUsed", comment, "guestEmail", source, "dailyNumber",
           fulfillment, "paymentMethod")
         VALUES ($1, $2, $3, $4, 0, $5, $6, 'KIOSK', $7, 'DINE_IN', $8)`,
        [orderId, userId, total, discountAmount, comment, userId ? null : guestEmail, ticket, paymentMethod]
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
      return ticket;
    });

    let paymentUrl: string | null = null;
    let paymentPayload: string | null = null;
    let paymentImage: string | null = null;
    if (needsBank) {
      try {
        const payment = await startTbankPayment({
          id: orderId,
          total,
          dailyNumber,
          method: 'sbp',
        });
        paymentUrl = payment.paymentUrl;
        paymentPayload = payment.payload;
        paymentImage = payment.image;
        if (!paymentImage) {
          throw new Error('Т-Банк не вернул QR-код');
        }
      } catch (error) {
        console.error('Create kiosk T-Bank payment error:', error);
        await query(`UPDATE "orders" SET status = 'CANCELLED' WHERE id = $1`, [orderId]);
        await settleOrderLoyalty(orderId, 'CANCELLED');
        const message = error instanceof TbankError ? error.message : 'Не удалось создать платёж';
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    let inviteSent = false;
    if (guestEmail && !userId) {
      try {
        await sendKioskInvite(guestEmail, kioskRegisterUrl(guestEmail));
        inviteSent = true;
      } catch (error) {
        console.error('Kiosk invite email failed:', error);
      }
    }

    const order = await fetchOrderWithItems(orderId);

    if (!needsBank) {
      after(() => notifyKitchenNewOrder(orderId, request));
    }

    return NextResponse.json({
      order,
      inviteSent,
      guest: !userId,
      displayNumber: String(dailyNumber),
      payment: needsBank ? { paymentUrl, payload: paymentPayload, image: paymentImage } : null,
    });
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) {
      return NextResponse.json({ error: 'Терминал заблокирован' }, { status: 401 });
    }
    console.error('Create kiosk order error:', error);
    return NextResponse.json({ error: 'Ошибка создания заказа' }, { status: 500 });
  }
}
