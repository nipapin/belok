import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { kitchenCardSchema } from '@/lib/kitchen';
import { saveKitchenCard } from '@/lib/kitchenStorage';

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const result = kitchenCardSchema.safeParse(await request.json().catch(() => null));
    if (!result.success) return NextResponse.json(
      { error: result.error.issues[0]?.message || 'Проверьте поля техкарты' }, { status: 400 }
    );
    if (result.data.id !== id) return NextResponse.json({ error: 'Неверный идентификатор карты' }, { status: 400 });
    const card = await saveKitchenCard(result.data);
    if (!card) return NextResponse.json(
      { error: 'Карта уже изменена другим администратором. Откройте её заново и повторите изменения.' }, { status: 409 }
    );
    return NextResponse.json({ card });
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin kitchen PUT:', error);
    return NextResponse.json({ error: 'Не удалось сохранить техкарту' }, { status: 500 });
  }
}
