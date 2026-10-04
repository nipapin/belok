import { NextResponse } from 'next/server';
import { readKitchenCards } from '@/lib/kitchenStorage';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET() {
  try {
    await requireAdmin();
    const cards = (await readKitchenCards()).filter(card => card.published)
      .map(card => ({ ...card, sourceText: '' }));
    return NextResponse.json({ cards }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    console.error('Kitchen GET:', error);
    return NextResponse.json({ error: 'Не удалось загрузить техкарты. Попробуйте снова.' }, { status: 500 });
  }
}
