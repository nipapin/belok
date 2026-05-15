import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '@/lib/db';
import { sendVerificationCode } from '@/lib/email';
import { issueCode, isValidEmail, normalizeEmail } from '@/lib/verificationCode';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';
import type { LoyaltyLevelRow, UserRow } from '@/lib/types';

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);

  const ipLimit = rateLimit(`register:ip:${ip}`, 10, 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: `Слишком много запросов. Попробуйте через ${ipLimit.retryAfterSec} с` },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { email?: unknown; password?: unknown; name?: unknown }
      | null;
    const emailRaw = typeof body?.email === 'string' ? body.email : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : undefined;

    if (!emailRaw || !password) {
      return NextResponse.json({ error: 'Email и пароль обязательны' }, { status: 400 });
    }
    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Пароль должен быть не короче 8 символов' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    const emailLimit = rateLimit(`register:email:${email}`, 5, 60);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: `Слишком частые запросы. Попробуйте через ${emailLimit.retryAfterSec} с` },
        { status: 429 }
      );
    }

    const existing = await queryOne<UserRow>(
      `SELECT * FROM "users" WHERE email = $1`,
      [email]
    );
    if (existing?.emailVerifiedAt) {
      return NextResponse.json(
        { error: 'Пользователь с таким email уже зарегистрирован. Войдите.' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const defaultLevel = await queryOne<LoyaltyLevelRow>(
      `SELECT id, name, "minSpent", "cashbackPercent", "discountPercent", "sortOrder"
         FROM "loyalty_levels"
        WHERE "minSpent" = 0
        ORDER BY "minSpent" ASC
        LIMIT 1`
    );

    if (existing) {
      await query(
        `UPDATE "users"
            SET "passwordHash" = $1${name ? ', "name" = $3' : ''}
          WHERE id = $2`,
        name ? [passwordHash, existing.id, name] : [passwordHash, existing.id]
      );
    } else {
      await query(
        `INSERT INTO "users"(id, email, "passwordHash", "name", "loyaltyLevelId")
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), email, passwordHash, name || null, defaultLevel?.id ?? null]
      );
    }

    try {
      const { code, expiresAt } = await issueCode(email, 'REGISTER');
      await sendVerificationCode(email, code);
      return NextResponse.json({
        success: true,
        email,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      const e = err as Error & { code?: string; retryInSec?: number };
      if (e.code === 'RATE_LIMITED') {
        return NextResponse.json({ error: e.message, retryInSec: e.retryInSec }, { status: 429 });
      }
      throw err;
    }
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Не удалось отправить код' }, { status: 500 });
  }
}
