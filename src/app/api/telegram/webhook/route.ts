import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureTelegramSchema } from '@/lib/telegramSchema';
import { validWebhookSecret } from '@/lib/telegramValidation';
import { telegramCall, telegramMenuButton } from '@/lib/telegramBot';

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !validWebhookSecret(request.headers.get('x-telegram-bot-api-secret-token'), token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const update = await request.json().catch(() => null);
  const message = update?.message;
  if (message?.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) || message.chat.id <= 0
      || message.from?.id !== message.chat.id || typeof message.text !== 'string'
      || !/^\/start(?:@belok_chat_bot)?(?:\s|$)/i.test(message.text)) {
    return NextResponse.json({ ok: true });
  }
  try {
    await ensureTelegramSchema();
    await query('INSERT INTO telegram_chats(id,active) VALUES($1,TRUE) ON CONFLICT(id) DO UPDATE SET active=TRUE', [message.chat.id]);
    const menu = telegramMenuButton();
    await telegramCall('sendMessage', {
      chat_id: message.chat.id,
      text: 'Привет! Это Белок 🥗\nВыберите блюда в меню и оформите заказ. Здесь сообщим, когда он будет готов.',
      reply_markup: { inline_keyboard: [[{ text: menu.text, web_app: menu.web_app }]] },
    });
    return NextResponse.json({ ok: true });
  } catch {
    console.error('Telegram start reply failed');
    return NextResponse.json({ error: 'Temporary failure' }, { status: 503 });
  }
}
