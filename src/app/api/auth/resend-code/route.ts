import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { sendVerificationCode } from '@/lib/email';
import { issueCode, isValidEmail, normalizeEmail } from '@/lib/verificationCode';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';

/**
 * Re-issue a 6-digit email-verification code. Only used during registration:
 * once an email is verified, the user logs in with email + password (no code).
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const ipLimit = rateLimit(`resend:ip:${ip}`, 10, 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: `Слишком часто. Подождите ${ipLimit.retryAfterSec} с` },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const emailRaw = typeof body?.email === 'string' ? body.email : '';

    if (!emailRaw) {
      return NextResponse.json({ error: 'Email обязателен' }, { status: 400 });
    }
    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    const emailLimit = rateLimit(`resend:email:${email}`, 4, 60);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: `Подождите ${emailLimit.retryAfterSec} с перед повторной отправкой` },
        { status: 429 }
      );
    }

    const user = await queryOne<{ id: string; emailVerifiedAt: Date | null }>(
      `SELECT id, "emailVerifiedAt" FROM "users" WHERE email = $1`,
      [email]
    );
    if (!user) {
      return NextResponse.json(
        { error: 'Аккаунт не найден. Зарегистрируйтесь.' },
        { status: 404 }
      );
    }
    if (user.emailVerifiedAt) {
      return NextResponse.json(
        { error: 'Email уже подтверждён — войдите по паролю.' },
        { status: 409 }
      );
    }

    try {
      const { code, expiresAt } = await issueCode(email, 'REGISTER');
      await sendVerificationCode(email, code);
      return NextResponse.json({ success: true, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      const e = err as Error & { code?: string; retryInSec?: number };
      if (e.code === 'RATE_LIMITED') {
        return NextResponse.json({ error: e.message, retryInSec: e.retryInSec }, { status: 429 });
      }
      throw err;
    }
  } catch (error) {
    console.error('Resend code error:', error);
    return NextResponse.json({ error: 'Не удалось отправить код' }, { status: 500 });
  }
}
