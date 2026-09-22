import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getUserWithLoyaltyById } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { normalizeRuPhone } from '@/lib/phone';
import { toClientUser } from '@/lib/userClient';

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; email?: unknown; phone?: unknown }
      | null;
    const name = typeof body?.name === 'string' ? body.name : undefined;
    const email = typeof body?.email === 'string' ? body.email : undefined;
    const phoneRaw = typeof body?.phone === 'string' ? body.phone : undefined;

    let phone: string | null | undefined;
    if (phoneRaw !== undefined) {
      const parsed = normalizeRuPhone(phoneRaw);
      if (!parsed.ok) {
        return NextResponse.json({ error: 'Укажите номер телефона полностью' }, { status: 400 });
      }
      phone = parsed.phone;
      if (phone) {
        const taken = await queryOne<{ id: string }>(
          `SELECT id FROM "users" WHERE "phone" = $1 AND id <> $2`,
          [phone, user.id]
        );
        if (taken) {
          return NextResponse.json({ error: 'Этот номер уже указан в другом профиле' }, { status: 409 });
        }
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (name !== undefined) {
      params.push(name);
      sets.push(`"name" = $${params.length}`);
    }
    if (email !== undefined) {
      params.push(email);
      sets.push(`"email" = $${params.length}`);
    }
    if (phone !== undefined) {
      params.push(phone);
      sets.push(`"phone" = $${params.length}`);
    }

    if (sets.length > 0) {
      params.push(user.id);
      await query(
        `UPDATE "users" SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    const updated = await getUserWithLoyaltyById(user.id);
    if (!updated) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 500 });

    return NextResponse.json({ user: toClientUser(updated) });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
    if (code === '23505') {
      return NextResponse.json({ error: 'Этот номер уже указан в другом профиле' }, { status: 409 });
    }
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
