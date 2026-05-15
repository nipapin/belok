import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getUserWithLoyaltyById } from '@/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdmin();
    const { userId } = await params;

    const trimmed = userId.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Пустой идентификатор' }, { status: 400 });
    }

    const user = await getUserWithLoyaltyById(trimmed);
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        bonusBalance: user.bonusBalance,
        totalSpent: user.totalSpent,
        loyaltyLevel: user.loyaltyLevel,
      },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
