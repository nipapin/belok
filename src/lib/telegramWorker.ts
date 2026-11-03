import { withTransaction } from '@/lib/db';
import { ensureTelegramSchema } from '@/lib/telegramSchema';
import { configureTelegramBot, telegramCall, TelegramApiError, telegramAppOrigin, telegramOrderText } from '@/lib/telegramBot';

let started = false;
/** Only the production port owns bot configuration; preview must not take its webhook. */
export function shouldStartTelegramWorker(env: NodeJS.ProcessEnv = process.env) {
  return !!env.TELEGRAM_BOT_TOKEN?.trim() && env.NODE_ENV === 'production'
    && env.NEXT_PHASE !== 'phase-production-build' && env.TELEGRAM_BOT_ENABLED !== 'false'
    && (!env.PORT || env.PORT === '3000');
}
export async function deliverTelegramOutbox() {
  await withTransaction(async client => {
    // A delayed retry must not announce "preparing" after "ready" was delivered.
    await client.query(`UPDATE telegram_outbox q SET "discardedAt"=NOW()
      WHERE q."sentAt" IS NULL AND q."discardedAt" IS NULL AND EXISTS (
        SELECT 1 FROM telegram_outbox newer WHERE newer."orderId"=q."orderId"
        AND newer.id>q.id AND newer."sentAt" IS NOT NULL)`);
    const result = await client.query<{ id: string; chatId: string; orderId: string; status: string; ticket: string; attempts: number }>(`
      SELECT q.* FROM telegram_outbox q JOIN telegram_chats c ON c.id=q."chatId" AND c.active
      WHERE q."sentAt" IS NULL AND q."discardedAt" IS NULL AND q.attempts < 12 AND q."nextAttemptAt" <= NOW()
      ORDER BY q.id LIMIT 1 FOR UPDATE OF q SKIP LOCKED`);
    const item = result.rows[0];
    if (!item) return;
    try {
      await telegramCall('sendMessage', {
        chat_id: item.chatId, text: telegramOrderText(item.status, item.ticket),
        reply_markup: { inline_keyboard: [[{ text: 'Мой заказ', web_app: {
          url: `${telegramAppOrigin()}/telegram?order=${encodeURIComponent(item.orderId)}`,
        } }]] },
      });
      await client.query('UPDATE telegram_outbox SET "sentAt"=NOW() WHERE id=$1', [item.id]);
    } catch (error) {
      if (error instanceof TelegramApiError && error.code === 403) {
        await client.query('UPDATE telegram_chats SET active=FALSE WHERE id=$1', [item.chatId]);
      }
      const seconds = error instanceof TelegramApiError && error.code === 429
        ? Math.max(1, error.retryAfter) : Math.min(3600, 30 * 2 ** item.attempts);
      await client.query(`UPDATE telegram_outbox SET attempts=attempts+1, "nextAttemptAt"=NOW()+$2*INTERVAL '1 second' WHERE id=$1`, [item.id, seconds]);
    }
  });
}
export function startTelegramWorker() {
  if (started || !shouldStartTelegramWorker()) return;
  started = true;
  let configured = false;
  const tick = async () => {
    try {
      await ensureTelegramSchema();
      if (!configured) { await configureTelegramBot(); configured = true; console.info('Telegram bot configured'); }
      for (let i = 0; i < 5; i++) await deliverTelegramOutbox();
    } catch { console.error('Telegram worker unavailable; will retry'); }
    setTimeout(tick, configured ? 3000 : 60_000).unref();
  };
  void tick();
}
