import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { generateApplePassJson } from '@/lib/wallet';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const passData = generateApplePassJson({
      userId: user.id,
      userName: user.name || '',
      phone: user.phone,
      loyaltyLevel: user.loyaltyLevel?.name || 'Бронза',
      bonusBalance: user.bonusBalance,
      totalSpent: user.totalSpent,
      barcode: `BELOK-${user.id}`,
    });

    // In production with real certificates, this would return a .pkpass file.
    // For now, return the pass JSON for development/testing.
    return NextResponse.json({
      pass: passData,
      message: 'Для полноценной генерации .pkpass необходимы сертификаты Apple Developer. Текущий ответ — структура карты.',
    });
  } catch (error) {
    console.error('Apple wallet error:', error);
    return NextResponse.json({ error: 'Ошибка генерации карты' }, { status: 500 });
  }
}
