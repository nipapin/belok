import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import {
  getNotificationSettings,
  sanitizeNotificationSettings,
  saveNotificationSettings,
} from '@/lib/notificationSettings';

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getNotificationSettings();
    return NextResponse.json({ settings });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin notification-settings GET error:', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
    }
    const settings = await saveNotificationSettings(sanitizeNotificationSettings(body));
    return NextResponse.json({ settings });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin notification-settings PUT error:', e);
    return NextResponse.json({ error: 'Ошибка сохранения' }, { status: 500 });
  }
}
