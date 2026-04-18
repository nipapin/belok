import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { toClientUser } from '@/lib/userClient';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    return NextResponse.json({
      user: toClientUser(user),
    });
  } catch (error) {
    console.error('Get me error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
