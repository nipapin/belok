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
}): Promise<{ paymentId: string; paymentUrl: string | null; payload: string | null }> {
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
  if (order.method === 'sbp') {
    try {
      const qr = await tbankGetQr(paymentId);
      if (qr.Success && qr.Data) payload = qr.Data;
    } catch (error) {
      console.error('T-Bank GetQr failed:', error);
    }
  }

  const paymentUrl = typeof init.PaymentURL === 'string' && init.PaymentURL ? init.PaymentURL : null;
  return { paymentId, paymentUrl, payload };
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
      void notifyKitchenNewOrder(orderId).catch((err) => {
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
}> {
  if (order.paymentStatus !== 'PENDING' || !order.tbankPaymentId) {
    return { paymentStatus: order.paymentStatus, bankStatus: null, payload: null };
  }

  let bankStatus: string | null = null;
  try {
    const state = await tbankGetState(order.tbankPaymentId);
    bankStatus = state.Status ?? null;
    if (bankStatus) {
      await applyTbankPaymentStatus(order.id, bankStatus);
    }
  } catch (error) {
    console.error('T-Bank GetState failed:', error);
  }

  const latest = await queryOne<OrderRow>(`SELECT * FROM "orders" WHERE id = $1`, [order.id]);
  const paymentStatus = latest?.paymentStatus ?? order.paymentStatus;
  if (paymentStatus !== 'PENDING') {
    return { paymentStatus, bankStatus, payload: null };
  }

  let payload: string | null = null;
  try {
    const qr = await tbankGetQr(order.tbankPaymentId);
    if (qr.Success && qr.Data) payload = qr.Data;
  } catch (error) {
    console.error('T-Bank GetQr failed:', error);
  }

  return { paymentStatus, bankStatus, payload };
}
