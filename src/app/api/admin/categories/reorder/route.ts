import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { withTransaction } from '@/lib/db';
import { parseReorderItems } from '@/lib/reorder';

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    const items = parseReorderItems(body?.items ?? body);
    if (!items) {
      return NextResponse.json({ error: 'Некорректный список порядка' }, { status: 400 });
    }

    await withTransaction(async (client) => {
      for (const item of items) {
        await client.query(`UPDATE "categories" SET "sortOrder" = $1 WHERE id = $2`, [
          item.sortOrder,
          item.id,
        ]);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin categories reorder error:', e);
    return NextResponse.json({ error: 'Ошибка сохранения порядка' }, { status: 500 });
  }
}
