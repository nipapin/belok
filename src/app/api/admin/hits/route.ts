import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getHitsConfig, saveHitsConfig, sanitizeHitsConfig } from '@/lib/hits';
import { query } from '@/lib/db';

export async function GET() {
  try {
    await requireAdmin();
    const config = await getHitsConfig();
    return NextResponse.json(config);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin hits GET error:', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    const config = sanitizeHitsConfig(body);
    if (config.productIds.length > 0) {
      const rows = await query<{ id: string }>(
        `SELECT id FROM "products" WHERE id = ANY($1::text[])`,
        [config.productIds]
      );
      const existing = new Set(rows.map((r) => r.id));
      const productIds = config.productIds.filter((id) => existing.has(id));
      const saved = await saveHitsConfig({ productIds });
      return NextResponse.json(saved);
    }
    const saved = await saveHitsConfig(config);
    return NextResponse.json(saved);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin hits PUT error:', e);
    return NextResponse.json({ error: 'Ошибка сохранения' }, { status: 500 });
  }
}
