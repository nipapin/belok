import { after, NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '@/lib/db';
import { getUserWithLoyaltyById } from '@/lib/auth';
import { sendKioskInvite } from '@/lib/email';
import { KioskUnauthorizedError, requireKioskUnlocked } from '@/lib/kioskAuth';
import { formatGuestOrderNumber } from '@/lib/orderCustomer';
import { getNotificationSettings } from '@/lib/notificationSettings';
import { absolutePushUrl, getPublicAppOrigin, tryNotifyAdmins } from '@/lib/push';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';
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

function truncatePushText(text: string, max = 180): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function buildNewOrderPushBody(args: {
  customer: string;
  items: { name: string; quantity: number }[];
  total: number;
}): string {
  const summary = args.items
    .map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name))
    .join(', ');
  return truncatePushText(`${args.customer} · ${summary} · ${args.total} ₽`);
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
      | { items?: IncomingItem[]; email?: unknown; comment?: unknown }
      | null;
    const items = body?.items ?? [];
    const comment = typeof body?.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;
    const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Корзина пуста' }, { status: 400 });
    }

    let guestEmail: string | null = null;
    let userId: string | null = null;
    let customerName: string | null = null;
    let discountPercent = 0;

    if (emailRaw) {
      if (!isValidEmail(emailRaw)) {
        return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
      }
      guestEmail = normalizeEmail(emailRaw);
      const existing = await queryOne<UserRow>(`SELECT * FROM "users" WHERE email = $1`, [guestEmail]);
      if (existing) {
        userId = existing.id;
        customerName = existing.name || existing.email;
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
    const orderId = uuidv4();

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO "orders"
          (id, "userId", total, "discountAmount", "bonusUsed", comment, "guestEmail", source)
         VALUES ($1, $2, $3, $4, 0, $5, $6, 'KIOSK')`,
        [orderId, userId, total, discountAmount, comment, userId ? null : guestEmail]
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
    });

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
    const customer =
      customerName ||
      guestEmail ||
      formatGuestOrderNumber(orderId);

    const itemLines = computedItems.map((item) => ({
      name: productMap.get(item.productId)?.name ?? 'Товар',
      quantity: item.quantity,
    }));
    const adminOrderUrl = absolutePushUrl(`/admin/orders/${orderId}`, request);
    after(async () => {
      const settings = await getNotificationSettings();
      if (!settings.adminNewOrdersPush) return;
      await tryNotifyAdmins({
        title: 'Новый заказ',
        body: buildNewOrderPushBody({ customer, items: itemLines, total }),
        url: adminOrderUrl,
        tag: `order-new-${orderId}`,
      });
    });

    return NextResponse.json({
      order,
      inviteSent,
      guest: !userId,
      displayNumber: orderId.slice(0, 8),
    });
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) {
      return NextResponse.json({ error: 'Терминал заблокирован' }, { status: 401 });
    }
    console.error('Create kiosk order error:', error);
    return NextResponse.json({ error: 'Ошибка создания заказа' }, { status: 500 });
  }
}
