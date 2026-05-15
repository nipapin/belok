import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne } from '@/lib/db';
import { sendVerificationCode } from '@/lib/email';
import {
  createSession,
  getUserWithLoyaltyById,
  setSessionCookieOnResponse,
} from '@/lib/auth';
import { toClientUser } from '@/lib/userClient';
import { issueCode, isValidEmail, normalizeEmail } from '@/lib/verificationCode';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';
import type { UserRow } from '@/lib/types';

/**
 * Login: email + password → session immediately. Code is NOT required for login —
 * the password is the auth factor, an email round-trip on every sign-in adds
 * friction without any extra security.
 *
 * If the user's email is not yet verified (they registered but never confirmed),
 * we issue a fresh verification code and ask the client to switch to the code
 * step instead of granting a session.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);

  const ipLimit = rateLimit(`login:ip:${ip}`, 30, 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: `Слишком много запросов. Попробуйте через ${ipLimit.retryAfterSec} с` },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { email?: unknown; password?: unknown }
      | null;
    const emailRaw = typeof body?.email === 'string' ? body.email : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!emailRaw || !password) {
      return NextResponse.json({ error: 'Email и пароль обязательны' }, { status: 400 });
    }
    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    const emailLimit = rateLimit(`login:email:${email}`, 10, 60);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: `Слишком частые запросы. Попробуйте через ${emailLimit.retryAfterSec} с` },
        { status: 429 }
      );
    }

    const user = await queryOne<UserRow>(
      `SELECT * FROM "users" WHERE email = $1`,
      [email]
    );

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Неверный email или пароль' },
        { status: 401 }
      );
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return NextResponse.json({ error: 'Неверный email или пароль' }, { status: 401 });
    }

    if (!user.emailVerifiedAt) {
      try {
        const { code, expiresAt } = await issueCode(email, 'REGISTER');
        await sendVerificationCode(email, code);
        return NextResponse.json({
          requiresVerification: true,
          email,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (err) {
        const e = err as Error & { code?: string; retryInSec?: number };
        if (e.code === 'RATE_LIMITED') {
          return NextResponse.json(
            {
              requiresVerification: true,
              email,
              error: e.message,
              retryInSec: e.retryInSec,
            },
            { status: 429 }
          );
        }
        throw err;
      }
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
    });
    setSessionCookieOnResponse(response, request, session.id);
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Не удалось войти' }, { status: 500 });
  }
}
