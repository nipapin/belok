import { query, queryOne, withTransaction } from '@/lib/db';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import { notifyKitchenNewOrder } from '@/lib/orderNotify';
import type { OrderRow, PaymentStatus } from '@/lib/types';
import {
  assertTbankSuccess,
  paymentIdToString,
  tbankGetQr,
  tbankGetState,
  tbankInit,
} from '@/lib/tbank';

const PAID_STATUSES = new Set(['CONFIRMED']);
const FAILED_STATUSES = new Set([
  'REJECTED',
  'CANCELED',
  'CANCELLED',
  'DEADLINE_EXPIRED',
  'AUTH_FAIL',
]);

export type AppliedBankOutcome = 'paid' | 'cancelled' | 'pending';

export async function startTbankPayment(order: {
  id: string;
  total: number;
  dailyNumber?: number | null;
  method: 'card' | 'sbp';
}): Promise<{ paymentId: string; paymentUrl: string | null; payload: string | null; image: string | null }> {
  const amountKopecks = Math.round(order.total * 100);
  const ticket =
    order.dailyNumber != null && order.dailyNumber > 0 ? `#${order.dailyNumber}` : order.id.slice(0, 8);
  const init = await tbankInit({
    amountKopecks,
    orderId: order.id,
    description: `Заказ ${ticket}`,
    method: order.method,
  });
  assertTbankSuccess(init, 'Не удалось создать платёж');
  const paymentId = paymentIdToString(init.PaymentId);
  if (!paymentId) {
    throw new Error('Т-Банк не вернул идентификатор платежа');
  }

  await query(`UPDATE "orders" SET "tbankPaymentId" = $1 WHERE id = $2`, [paymentId, order.id]);

  let payload: string | null = null;
  let image: string | null = null;
  if (order.method === 'sbp') {
    try {
      const qr = await loadSbpQr(paymentId);
      payload = qr.payload;
      image = qr.image;
    } catch (error) {
      console.error('T-Bank GetQr failed:', { orderId: order.id, paymentId, error });
    }
  }

  const paymentUrl = typeof init.PaymentURL === 'string' && init.PaymentURL ? init.PaymentURL : null;
  return { paymentId, paymentUrl, payload, image };
}

async function loadSbpQr(paymentId: string): Promise<{ payload: string | null; image: string | null }> {
  const results = await Promise.allSettled([
    tbankGetQr(paymentId, 'PAYLOAD'),
    tbankGetQr(paymentId, 'IMAGE'),
  ]);
  const [payloadResult, imageResult] = results;
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.error('T-Bank QR request failed:', {
        paymentId, dataType: index === 0 ? 'PAYLOAD' : 'IMAGE',
        reason: result.reason instanceof Error ? result.reason.message : 'UnknownError',
      });
    }
  }
  const payloadQr = payloadResult.status === 'fulfilled' ? payloadResult.value : null;
  const imageQr = imageResult.status === 'fulfilled' ? imageResult.value : null;
  const payloadData = typeof payloadQr?.Data === 'string' ? payloadQr.Data.trim() : '';
  const imageData = typeof imageQr?.Data === 'string' ? imageQr.Data.trim() : '';
  return {
    payload: payloadQr?.Success && payloadData.startsWith('http') ? payloadData : null,
    image: imageQr?.Success && imageData.startsWith('<svg') ? imageData : null,
  };
}

export async function applyTbankPaymentStatus(
  orderId: string,
  bankStatus: string
): Promise<AppliedBankOutcome> {
  const status = bankStatus.toUpperCase();

  if (PAID_STATUSES.has(status)) {
    let shouldNotify = false;
    await withTransaction(async (client) => {
      const result = await client.query<Pick<OrderRow, 'id' | 'paymentStatus'>>(
        `SELECT id, "paymentStatus" FROM "orders" WHERE id = $1 FOR UPDATE`,
        [orderId]
      );
      const order = result.rows[0];
      if (!order || order.paymentStatus !== 'PENDING') return;
      await client.query(`UPDATE "orders" SET "paymentStatus" = 'SUCCEEDED' WHERE id = $1`, [
        orderId,
      ]);
      shouldNotify = true;
    });
    if (shouldNotify) {
      await notifyKitchenNewOrder(orderId).catch((err) => {
        console.error('Kitchen notify after SBP payment failed:', err);
      });
    }
    return 'paid';
  }

  if (FAILED_STATUSES.has(status)) {
    const order = await queryOne<Pick<OrderRow, 'status' | 'paymentStatus'>>(
      `SELECT status, "paymentStatus" FROM "orders" WHERE id = $1`,
      [orderId]
    );
    if (!order) return 'pending';
    if (order.paymentStatus === 'SUCCEEDED') return 'paid';
    if (order.status === 'CANCELLED' || order.paymentStatus === 'CANCELLED') return 'cancelled';

    await query(`UPDATE "orders" SET status = 'CANCELLED' WHERE id = $1`, [orderId]);
    await settleOrderLoyalty(orderId, 'CANCELLED');
    return 'cancelled';
  }

  return 'pending';
}

export async function syncSbpPayment(order: OrderRow): Promise<{
  paymentStatus: PaymentStatus;
  bankStatus: string | null;
  payload: string | null;
  image: string | null;
  error?: string;
}> {
  if (order.paymentStatus !== 'PENDING' || !order.tbankPaymentId) {
    return { paymentStatus: order.paymentStatus, bankStatus: null, payload: null, image: null };
  }

  let bankStatus: string | null = null;
  let paymentError: string | undefined;
  try {
    const state = await tbankGetState(order.tbankPaymentId);
    assertTbankSuccess(state, 'Не удалось проверить оплату');
    bankStatus = state.Status ?? null;
    if (bankStatus) {
      await applyTbankPaymentStatus(order.id, bankStatus);
    }
  } catch (error) {
    console.error('T-Bank GetState failed:', { orderId: order.id, paymentId: order.tbankPaymentId, error });
    paymentError = 'Не удалось проверить оплату. Если деньги списаны, не оплачивайте повторно — дождитесь обновления статуса.';
  }

  const latest = await queryOne<OrderRow>(`SELECT * FROM "orders" WHERE id = $1`, [order.id]);
  const paymentStatus = latest?.paymentStatus ?? order.paymentStatus;
  if (paymentStatus !== 'PENDING') {
    return { paymentStatus, bankStatus, payload: null, image: null };
  }

  let payload: string | null = null;
  let image: string | null = null;
  try {
    const qr = await loadSbpQr(order.tbankPaymentId);
    payload = qr.payload;
    image = qr.image;
    if (!payload && !image && !paymentError) {
      paymentError = 'Не удалось получить данные для оплаты. Попробуйте обновить их.';
    }
  } catch (error) {
    console.error('T-Bank GetQr failed:', { orderId: order.id, paymentId: order.tbankPaymentId, error });
    paymentError ??= 'Не удалось получить данные для оплаты. Попробуйте обновить их.';
  }

  return { paymentStatus, bankStatus, payload, image, error: paymentError };
}
