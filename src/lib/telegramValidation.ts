import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser { id: number; first_name: string; last_name?: string }

/** Only signed, recent initData is an identity; initDataUnsafe is never trusted. */
export function validateTelegramInitData(raw: string, token: string, now = Date.now()): TelegramUser {
  if (!raw || raw.length > 16_384) throw new Error('Invalid Telegram data');
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate Telegram fields');
  const hash = params.get('hash') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Invalid Telegram signature');
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  if (!timingSafeEqual(Buffer.from(hash, 'hex'), expected)) throw new Error('Invalid Telegram signature');
  const date = Number(params.get('auth_date'));
  const age = now / 1000 - date;
  if (!Number.isInteger(date) || date <= 0 || age < -30 || age > 600) throw new Error('Expired Telegram data');
  const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== 'string') {
    throw new Error('Invalid Telegram user');
  }
  return user;
}

export function telegramWebhookSecret(token: string): string {
  return createHmac('sha256', token).update('belok-telegram-webhook-v1').digest('hex');
}

export function validWebhookSecret(value: string | null, token: string): boolean {
  const expected = telegramWebhookSecret(token);
  return !!value && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
