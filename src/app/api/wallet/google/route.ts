import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { generateGoogleWalletLink } from '@/lib/wallet';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const link = generateGoogleWalletLink({
      userId: user.id,
      userName: user.name || '',
      phone: user.phone,
      loyaltyLevel: user.loyaltyLevel?.name || 'Бронза',
      bonusBalance: user.bonusBalance,
      totalSpent: user.totalSpent,
      barcode: `BELOK-${user.id}`,
    });

    return NextResponse.json({ link });
  } catch (error) {
    console.error('Google wallet error:', error);
    return NextResponse.json({ error: 'Ошибка генерации ссылки' }, { status: 500 });
  }
}
