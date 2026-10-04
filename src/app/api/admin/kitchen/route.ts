import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { readKitchenCards } from '@/lib/kitchenStorage';

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ cards: await readKitchenCards() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin kitchen GET:', error);
    return NextResponse.json({ error: 'Не удалось загрузить техкарты' }, { status: 500 });
  }
}
