import { NextRequest, NextResponse } from 'next/server';
import { getUserWithLoyaltyById } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { KioskUnauthorizedError, requireKioskUnlocked } from '@/lib/kioskAuth';
import { isValidEmail, normalizeEmail } from '@/lib/verificationCode';

export async function GET(request: NextRequest) {
  try {
    await requireKioskUnlocked();
    const emailRaw = request.nextUrl.searchParams.get('email')?.trim() ?? '';
    if (!emailRaw || !isValidEmail(emailRaw)) {
      return NextResponse.json({ found: false });
    }

    const row = await queryOne<{ id: string }>(`SELECT id FROM "users" WHERE email = $1`, [
      normalizeEmail(emailRaw),
    ]);
    if (!row) {
      return NextResponse.json({ found: false });
    }

    const user = await getUserWithLoyaltyById(row.id);
    if (!user) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      bonusBalance: Math.floor(Number(user.bonusBalance) || 0),
      cashbackPercent: user.loyaltyLevel?.cashbackPercent ?? 3,
      discountPercent: user.loyaltyLevel?.discountPercent ?? 0,
      levelName: user.loyaltyLevel?.name ?? null,
    });
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) {
      return NextResponse.json({ error: 'Терминал заблокирован' }, { status: 401 });
    }
    console.error('Kiosk loyalty lookup error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
