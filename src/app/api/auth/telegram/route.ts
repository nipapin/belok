import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSession, getUserWithLoyaltyById, setSessionCookieOnResponse } from '@/lib/auth';
import { query, withTransaction } from '@/lib/db';
import { ensureTelegramSchema } from '@/lib/telegramSchema';
import { validateTelegramInitData } from '@/lib/telegramValidation';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';
import { toClientUser } from '@/lib/userClient';

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: 'Заказы через Telegram пока не подключены' }, { status: 503 });
  if (![request.nextUrl.origin, new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://belok.pro').origin].includes(request.headers.get('origin') ?? '')) {
    return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
  }
  const ip = clientIpFromHeaders(request.headers);
  if (!rateLimit(`telegram:auth:${ip}`, 30, 60).allowed) return NextResponse.json({ error: 'Попробуйте через минуту' }, { status: 429 });
  const body = await request.json().catch(() => null);
  let telegram;
  try { telegram = validateTelegramInitData(typeof body?.initData === 'string' ? body.initData : '', token); }
  catch { return NextResponse.json({ error: 'Не удалось проверить Telegram. Закройте приложение и откройте его снова.' }, { status: 401 }); }
  try {
    await ensureTelegramSchema();
    const userId = await withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [telegram.id]);
      const existing = await client.query<{ userId: string }>('SELECT "userId" FROM telegram_accounts WHERE "telegramId"=$1', [telegram.id]);
      if (existing.rows[0]) return existing.rows[0].userId;
      // Never link by name/username/phone or silently attach an existing admin session.
      const id = randomUUID();
      await client.query(`INSERT INTO users(id, name, "loyaltyLevelId") VALUES($1,$2,
        (SELECT id FROM loyalty_levels WHERE "minSpent"=0 ORDER BY "sortOrder" LIMIT 1))`,
        [id, [telegram.first_name, telegram.last_name].filter(Boolean).join(' ').slice(0, 150)]);
      await client.query('INSERT INTO telegram_accounts("telegramId","userId") VALUES($1,$2)', [telegram.id, id]);
      return id;
    });
    const session = await createSession(userId, { userAgent: request.headers.get('user-agent'), ipAddress: ip });
    await query('INSERT INTO telegram_sessions("sessionId","telegramId") VALUES($1,$2)', [session.id, telegram.id]);
    const user = await getUserWithLoyaltyById(userId);
    if (!user) throw new Error('Telegram user missing');
    const response = NextResponse.json({ user: toClientUser(user) });
    response.headers.set('Cache-Control', 'no-store');
    setSessionCookieOnResponse(response, request, session.id);
    return response;
  } catch {
    console.error('Telegram sign-in failed');
    return NextResponse.json({ error: 'Не удалось войти. Попробуйте ещё раз.' }, { status: 500 });
  }
}
