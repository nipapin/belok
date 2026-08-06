import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';
import {
  createSession,
  getUserWithLoyaltyById,
  revokeAllSessionsForUser,
  setSessionCookieOnResponse,
} from '@/lib/auth';
import { toClientUser } from '@/lib/userClient';
import { isValidEmail, normalizeEmail, verifyAndConsumeCode } from '@/lib/verificationCode';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';
import type { UserRow } from '@/lib/types';

/**
 * Reset password with email + 6-digit code + new password.
 * On success: updates hash, marks email verified, revokes other sessions, signs in.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const ipLimit = rateLimit(`reset:ip:${ip}`, 20, 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: `Слишком много запросов. Попробуйте через ${ipLimit.retryAfterSec} с` },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { email?: unknown; code?: unknown; password?: unknown }
      | null;
    const emailRaw = typeof body?.email === 'string' ? body.email : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!emailRaw || !code || !password) {
      return NextResponse.json(
        { error: 'Email, код и новый пароль обязательны' },
        { status: 400 }
      );
    }
    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Код должен состоять из 6 цифр' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Пароль должен быть не короче 8 символов' },
        { status: 400 }
      );
    }

    const email = normalizeEmail(emailRaw);

    const emailLimit = rateLimit(`reset:email:${email}`, 10, 60);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: `Слишком частые запросы. Попробуйте через ${emailLimit.retryAfterSec} с` },
        { status: 429 }
      );
    }

    const user = await queryOne<UserRow>(`SELECT * FROM "users" WHERE email = $1`, [email]);
    if (!user) {
      return NextResponse.json({ error: 'Неверный или просроченный код' }, { status: 400 });
    }

    const result = await verifyAndConsumeCode(email, 'PASSWORD_RESET', code);
    if (!result.ok) {
      const messages: Record<NonNullable<typeof result.reason>, string> = {
        INVALID: 'Неверный код',
        EXPIRED: 'Код истёк. Запросите новый.',
        TOO_MANY_ATTEMPTS: 'Слишком много попыток. Запросите новый код.',
        NOT_FOUND: 'Неверный или просроченный код',
      };
      return NextResponse.json(
        { error: messages[result.reason ?? 'NOT_FOUND'] },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE "users"
          SET "passwordHash" = $1,
              "emailVerifiedAt" = COALESCE("emailVerifiedAt", NOW()),
              "updatedAt" = NOW()
        WHERE id = $2`,
      [passwordHash, user.id]
    );

    await revokeAllSessionsForUser(user.id);

    const userAgent = request.headers.get('user-agent') ?? null;
    const session = await createSession(user.id, { userAgent, ipAddress: ip });

    const fullUser = await getUserWithLoyaltyById(user.id);
    if (!fullUser) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 500 });
    }

    const response = NextResponse.json({
      success: true,
      user: toClientUser(fullUser),
    });
    setSessionCookieOnResponse(response, request, session.id);
    return response;
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Не удалось сбросить пароль' }, { status: 500 });
  }
}
