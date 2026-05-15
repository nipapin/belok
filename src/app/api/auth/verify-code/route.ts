import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import {
  createSession,
  getUserWithLoyaltyById,
  setSessionCookieOnResponse,
} from '@/lib/auth';
import { toClientUser } from '@/lib/userClient';
import { isValidEmail, normalizeEmail, verifyAndConsumeCode } from '@/lib/verificationCode';
import { rateLimit, clientIpFromHeaders } from '@/lib/rateLimit';
import type { UserRow } from '@/lib/types';

function adminBypassEmails(): Set<string> {
  const raw = process.env.ADMIN_BYPASS_EMAILS ?? '';
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Verify the 6-digit email-verification code that was issued during register
 * (or during login when the email wasn't yet verified). On success: mark
 * email verified, optionally upgrade ADMIN role, create a session.
 *
 * The user row must already exist (created by /api/auth/register). This route
 * does not create users from scratch — every account starts with a password
 * via /api/auth/register first.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const limited = rateLimit(`verify:${ip}`, 20, 60);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: `Слишком много попыток. Попробуйте через ${limited.retryAfterSec} с` },
      { status: 429 }
    );
  }

  try {
    const body = await request.json().catch(() => null) as { email?: unknown; code?: unknown } | null;
    const emailRaw = typeof body?.email === 'string' ? body.email : '';
    const codeRaw = typeof body?.code === 'string' ? body.code : '';

    if (!emailRaw || !codeRaw) {
      return NextResponse.json({ error: 'Email и код обязательны' }, { status: 400 });
    }
    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
    }
    const code = codeRaw.trim();
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Код должен состоять из 6 цифр' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    const result = await verifyAndConsumeCode(email, 'REGISTER', code);
    if (!result.ok) {
      const message =
        result.reason === 'EXPIRED'
          ? 'Код истёк. Запросите новый.'
          : result.reason === 'TOO_MANY_ATTEMPTS'
            ? 'Слишком много неверных попыток. Запросите новый код.'
            : result.reason === 'NOT_FOUND'
              ? 'Код не найден. Запросите новый.'
              : 'Неверный код';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const user = await queryOne<UserRow>(
      `SELECT * FROM "users" WHERE email = $1`,
      [email]
    );
    if (!user) {
      return NextResponse.json(
        { error: 'Аккаунт не найден. Зарегистрируйтесь заново.' },
        { status: 404 }
      );
    }

    const isAdminEmail = adminBypassEmails().has(email);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (!user.emailVerifiedAt) {
      sets.push(`"emailVerifiedAt" = NOW()`);
    }
    if (isAdminEmail && user.role !== 'ADMIN') {
      params.push('ADMIN');
      sets.push(`"role" = $${params.length}`);
    }
    if (sets.length > 0) {
      params.push(user.id);
      await query(
        `UPDATE "users" SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    const userAgent = request.headers.get('user-agent') ?? null;
    const session = await createSession(user.id, { userAgent, ipAddress: ip });

    const fullUser = await getUserWithLoyaltyById(user.id);
    if (!fullUser) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 500 });
    }

    const response = NextResponse.json({
      success: true,
      user: toClientUser(fullUser),
      isNewUser: !user.emailVerifiedAt,
    });
    setSessionCookieOnResponse(response, request, session.id);
    return response;
  } catch (error) {
    console.error('Verify code error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
