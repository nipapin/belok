import { v4 as uuidv4 } from 'uuid';

const SHOP_ID = process.env.YOOKASSA_SHOP_ID!;
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY!;
const BASE_URL = 'https://api.yookassa.ru/v3';

/** YooKassa payment description max length. */
export const YOOKASSA_DESCRIPTION_MAX = 128;
/** YooKassa metadata value max length. */
export const YOOKASSA_METADATA_VALUE_MAX = 512;

interface CreatePaymentParams {
  amount: number;
  orderId: string;
  description: string;
  returnUrl: string;
  /** Optional extra metadata (values truncated to 512 chars). */
  metadata?: Record<string, string>;
}

export function truncateYooKassaText(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return '…';
  return `${text.slice(0, max - 1)}…`;
}

export async function createPayment({
  amount,
  orderId,
  description,
  returnUrl,
  metadata,
}: CreatePaymentParams) {
  const idempotenceKey = uuidv4();

  const meta: Record<string, string> = {
    order_id: orderId,
  };
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      meta[key] = truncateYooKassaText(value, YOOKASSA_METADATA_VALUE_MAX);
    }
  }

  const response = await fetch(`${BASE_URL}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey,
      Authorization: `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64')}`,
    },
    body: JSON.stringify({
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB',
      },
      confirmation: {
        type: 'redirect',
        return_url: returnUrl,
      },
      capture: true,
      description: truncateYooKassaText(description, YOOKASSA_DESCRIPTION_MAX),
      metadata: meta,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('YooKassa error:', error);
    throw new Error('Payment creation failed');
  }

  return response.json();
}

export async function getPaymentStatus(paymentId: string) {
  const response = await fetch(`${BASE_URL}/payments/${paymentId}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get payment status');
  }

  return response.json();
}
