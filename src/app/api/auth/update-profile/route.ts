import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getUserWithLoyaltyById } from '@/lib/auth';
import { query } from '@/lib/db';
import { toClientUser } from '@/lib/userClient';

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; email?: unknown }
      | null;
    const name = typeof body?.name === 'string' ? body.name : undefined;
    const email = typeof body?.email === 'string' ? body.email : undefined;

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
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
