import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { isHomePublished, setHomePublished } from '@/lib/homeVisibility';

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ published: await isHomePublished() });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin home-published GET error:', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => null)) as { published?: unknown } | null;
    if (!body || typeof body.published !== 'boolean') {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
    }
    const published = await setHomePublished(body.published);
    return NextResponse.json({ published });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin home-published PUT error:', e);
    return NextResponse.json({ error: 'Ошибка сохранения' }, { status: 500 });
  }
}
