import { after, NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
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
import { syncSbpPayment } from '@/lib/tbankPayments';
import { aqsiConfigured, fiscalConfigured, getAqsiConfig } from '@/lib/aqsiConfig';
import { enqueueCard, processAqsiJobs } from '@/lib/aqsiJobs';
import { isValidEmail, normalizeEmail } from '@/lib/verificationCode';
import { priceOrderItems } from '@/lib/orderPricing';
import { VariantOrderError } from '@/lib/productVariants';
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
  variantId?: string | null;
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
      | {
          items?: IncomingItem[];
          email?: unknown;
          comment?: unknown;
          paymentMethod?: unknown;
          bonusUsed?: unknown;
          requestId?: unknown;
        }
      | null;
    const items = body?.items ?? [];
    const requestId = typeof body?.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(body.requestId) ? body.requestId : uuidv4();
    const requestHash = createHash('sha256').update(JSON.stringify({ ...body, requestId:undefined })).digest('hex');
    async function replayResponse(existing: OrderRow & {kioskRequestHash:string}) {
      if (existing.kioskRequestHash !== requestHash) return NextResponse.json({error:'Этот запрос уже использован для другого заказа'},{status:409});
      if (existing.status === 'CANCELLED') return NextResponse.json({error:'Заказ отменён. Оформите новый заказ.', cancelled:true},{status:409});
      const payment = existing.paymentMethod === 'SBP' ? await syncSbpPayment(existing) : null;
      return NextResponse.json({order:existing,displayNumber:String(existing.dailyNumber),guest:!existing.userId,
        payment:existing.paymentStatus === 'PENDING' && ['CARD','SBP'].includes(existing.paymentMethod ?? '')
          ? {method:existing.paymentMethod,payload:payment?.payload ?? null,image:payment?.image ?? null} : null});
    }
    const existingRequest = await queryOne<OrderRow & {kioskRequestHash:string}>(`SELECT * FROM orders WHERE "kioskRequestId"=$1`,[requestId]);
    if (existingRequest) return replayResponse(existingRequest);
    const comment = typeof body?.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;
    const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';
    const requestedBonusUsed =
      typeof body?.bonusUsed === 'number' && Number.isFinite(body.bonusUsed) ? body.bonusUsed : 0;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Корзина пуста' }, { status: 400 });
    }

    let guestEmail: string | null = null;
    let userId: string | null = null;
    let discountPercent = 0;
    let userBonusBalance = 0;

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
        userBonusBalance = Math.floor(Number(full?.bonusBalance) || 0);
      }
    }

    const stampedItems = await priceOrderItems(items);
    const subtotal = Math.round(stampedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100;

    const discountAmount = Math.round(subtotal * (discountPercent / 100));
    const afterDiscount = subtotal - discountAmount;
    const actualBonusUsed = userId
      ? Math.min(Math.max(0, Math.floor(requestedBonusUsed)), afterDiscount, userBonusBalance)
      : 0;
    const total = afterDiscount - actualBonusUsed;
    const requestedMethod = body?.paymentMethod === 'CASH' || body?.paymentMethod === 'SBP' || body?.paymentMethod === 'CARD' ? body.paymentMethod : null;
    if (total > 0 && !requestedMethod) {
      return NextResponse.json({ error: 'Выберите способ оплаты' }, { status: 400 });
    }
    const needsBank = total > 0 && requestedMethod === 'SBP';
    const needsTerminal = total > 0 && requestedMethod === 'CARD';
    const aqsi = await getAqsiConfig();
    if (needsTerminal && (!aqsiConfigured(aqsi) || !aqsi.receiptsEnabled || !fiscalConfigured(aqsi))) {
      return NextResponse.json({error:'Оплата картой на терминале пока не настроена',notCreated:true},{status:503});
    }
    if (needsBank && total < SBP_MIN_RUBLES) {
      return NextResponse.json(
        { error: `Онлайн-оплата принимает платежи от ${SBP_MIN_RUBLES} ₽` },
        { status: 400 }
      );
    }
    if (needsBank && !isTbankConfigured()) {
      return NextResponse.json({ error: 'Онлайн-оплата не настроена',notCreated:true }, { status: 503 });
    }

    let orderId = uuidv4();
    let replay: (OrderRow & {kioskRequestHash:string}) | null = null;
    const paymentMethod = !requestedMethod || total === 0 ? 'BONUS' : requestedMethod;

    const dailyNumber = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[requestId]);
      const previous = await client.query<OrderRow & {kioskRequestHash:string}>(`SELECT * FROM orders WHERE "kioskRequestId"=$1`,[requestId]);
      if (previous.rows[0]) { replay=previous.rows[0]; orderId=replay.id; return replay.dailyNumber; }
      if(actualBonusUsed>0 && userId) {
        const balance=await client.query<{bonusBalance:number}>(`SELECT "bonusBalance" FROM users WHERE id=$1 FOR UPDATE`,[userId]);
        if(!balance.rows[0] || balance.rows[0].bonusBalance<actualBonusUsed) throw new VariantOrderError('Бонусный баланс изменился. Обновите заказ.');
      }
      const ticket = await allocateOrderNumber(client);
      await client.query(
        `INSERT INTO "orders"
          (id, "userId", total, "discountAmount", "bonusUsed", comment, "guestEmail", source, "dailyNumber",
           fulfillment, "paymentMethod", "kioskRequestId", "kioskRequestHash")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'KIOSK', $8, 'DINE_IN', $9, $10, $11)`,
        [
          orderId,
          userId,
          total,
          discountAmount,
          actualBonusUsed,
          comment,
          userId ? null : guestEmail,
          ticket,
          paymentMethod,
          requestId,
          requestHash,
        ]
      );

      for (const item of stampedItems) {
        const itemId = uuidv4();
        const inserted = await client.query(
          `INSERT INTO "order_items"
             (id, "orderId", "productId", "variantId", "variantName", quantity, "unitPrice", "fiscalName")
           SELECT $1, $2, $3, $4, $5, $6, $7, p.name || $8 FROM products p WHERE p.id=$3`,
          [itemId, orderId, item.productId, item.variantId, item.variantName, item.quantity, item.unitPrice,
            `${item.variantName ? ` — ${item.variantName}` : ''}${item.customizations.map(c => `; ${c.action === 'ADD' ? '+' : '−'}${c.ingredientName}`).join('')}`]
        );
        if(inserted.rowCount!==1) throw new VariantOrderError('Товар изменился. Обновите заказ.');
        for (const c of item.customizations || []) {
          await client.query(
            `INSERT INTO "order_item_customizations"
              (id, "orderItemId", "ingredientId", action, "priceDelta", "ingredientName")
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [uuidv4(), itemId, c.ingredientId, c.action, c.priceDelta, c.ingredientName]
          );
        }
      }

      if (actualBonusUsed > 0 && userId) {
        await client.query(`UPDATE "users" SET "bonusBalance" = "bonusBalance" - $1 WHERE id = $2`, [
          actualBonusUsed,
          userId,
        ]);
        await client.query(
          `INSERT INTO "bonus_transactions"
             (id, "userId", amount, type, "orderId", description)
           VALUES ($1, $2, $3, 'SPENT', $4, $5)`,
          [uuidv4(), userId, -actualBonusUsed, orderId, 'Списание бонусов за заказ (киоск)']
        );
      }
      if (needsTerminal) await enqueueCard(client,orderId,total,aqsi.deviceId);
      return ticket;
    });

    if (replay) return replayResponse(replay);
    if (needsTerminal) after(() => processAqsiJobs());

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

    if (!needsBank && !needsTerminal) {
      await notifyKitchenNewOrder(orderId).catch((error) => {
        console.error('Kitchen notify failed:', error);
      });
    }

    return NextResponse.json({
      order,
      inviteSent,
      guest: !userId,
      displayNumber: String(dailyNumber),
      payment: needsTerminal ? {method:'CARD'} : needsBank ? {method:'SBP',paymentUrl, payload: paymentPayload, image: paymentImage } : null,
    });
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) {
      return NextResponse.json({ error: 'Терминал заблокирован' }, { status: 401 });
    }
    if (error instanceof VariantOrderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create kiosk order error:', error);
    return NextResponse.json({ error: 'Ошибка создания заказа' }, { status: 500 });
  }
}
