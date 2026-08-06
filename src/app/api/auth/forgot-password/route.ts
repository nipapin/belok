import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { sendPasswordResetCode } from '@/lib/email';
import { issueCode, isValidEmail, normalizeEmail } from '@/lib/verificationCode';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';

/**
 * Request a password-reset code by email.
 * Always returns a generic success response when the email format is valid,
 * so callers cannot enumerate which accounts exist.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const ipLimit = rateLimit(`forgot:ip:${ip}`, 10, 60);
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

    const emailLimit = rateLimit(`forgot:email:${email}`, 4, 60);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: `Подождите ${emailLimit.retryAfterSec} с перед повторной отправкой` },
        { status: 429 }
      );
    }

    const genericOk = NextResponse.json({
      success: true,
      email,
      message:
        'Если аккаунт с этим email существует, мы отправили код для сброса пароля.',
    });

    const user = await queryOne<{ id: string; passwordHash: string | null }>(
      `SELECT id, "passwordHash" FROM "users" WHERE email = $1`,
      [email]
    );

    if (!user?.passwordHash) {
      return genericOk;
    }

    try {
      const { code, expiresAt } = await issueCode(email, 'PASSWORD_RESET');
      await sendPasswordResetCode(email, code);
      return NextResponse.json({
        success: true,
        email,
        expiresAt: expiresAt.toISOString(),
        message:
          'Если аккаунт с этим email существует, мы отправили код для сброса пароля.',
      });
    } catch (err) {
      const e = err as Error & { code?: string; retryInSec?: number };
      if (e.code === 'RATE_LIMITED') {
        return NextResponse.json({ error: e.message, retryInSec: e.retryInSec }, { status: 429 });
      }
      throw err;
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Не удалось отправить код' }, { status: 500 });
  }
}
