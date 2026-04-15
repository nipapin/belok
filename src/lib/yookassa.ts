import { v4 as uuidv4 } from 'uuid';

const SHOP_ID = process.env.YOOKASSA_SHOP_ID!;
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY!;
const BASE_URL = 'https://api.yookassa.ru/v3';

interface CreatePaymentParams {
  amount: number;
  orderId: string;
  description: string;
  returnUrl: string;
}

export async function createPayment({ amount, orderId, description, returnUrl }: CreatePaymentParams) {
  const idempotenceKey = uuidv4();

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
      description,
      metadata: {
        order_id: orderId,
      },
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
