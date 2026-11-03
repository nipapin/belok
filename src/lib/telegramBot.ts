import { telegramWebhookSecret } from './telegramValidation';

export function telegramAppOrigin(): string {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://belok.pro');
  if (url.protocol !== 'https:') throw new Error('Telegram requires HTTPS');
  return url.origin;
}
export function telegramMenuButton() {
  return { type: 'web_app', text: '🍽 Заказать', web_app: { url: `${telegramAppOrigin()}/telegram` } };
}
export class TelegramApiError extends Error {
  constructor(public code: number, public retryAfter = 60) { super(`Telegram API error ${code}`); }
}
export async function telegramCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('Telegram is disabled');
  // Never propagate fetch errors containing the URL (the token is part of it).
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000), cache: 'no-store',
    });
  } catch { throw new Error('Telegram network request failed'); }
  const data = await response.json().catch(() => null) as { ok?: boolean; result: T; error_code?: number; parameters?: { retry_after?: number } } | null;
  if (!data?.ok) throw new TelegramApiError(data?.error_code ?? response.status, data?.parameters?.retry_after);
  return data.result;
}
export async function configureTelegramBot() {
  await telegramCall('setChatMenuButton', { menu_button: telegramMenuButton() });
  await telegramCall('setMyCommands', { commands: [{ command: 'start', description: 'Открыть меню Белка' }] });
  await telegramCall('setWebhook', {
    url: `${telegramAppOrigin()}/api/telegram/webhook`,
    secret_token: telegramWebhookSecret(process.env.TELEGRAM_BOT_TOKEN!.trim()),
    allowed_updates: ['message'],
  });
}
export function telegramOrderText(status: string, ticket: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Заказ получен. Статус оплаты можно посмотреть в приложении.',
    CONFIRMED: 'Заказ подтверждён.', PREPARING: 'Готовим ваш заказ.',
    READY: 'Заказ готов! Можно забирать.', COMPLETED: 'Спасибо за заказ!', CANCELLED: 'Заказ отменён.',
  };
  return `Заказ №${ticket}\n${labels[status] ?? 'Статус заказа изменён.'}`;
}
