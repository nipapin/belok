import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { KioskUnauthorizedError, requireKioskUnlocked } from '@/lib/kioskAuth';
import { isValidEmail, normalizeEmail } from '@/lib/verificationCode';

export async function GET(request: NextRequest) {
  try {
    await requireKioskUnlocked();
    const emailRaw = request.nextUrl.searchParams.get('email')?.trim() ?? '';
    if (!emailRaw || !isValidEmail(emailRaw)) {
      return NextResponse.json({ found: false, bonusBalance: 0 });
    }

    const user = await queryOne<{ bonusBalance: number }>(
      `SELECT "bonusBalance" FROM "users" WHERE email = $1`,
      [normalizeEmail(emailRaw)]
    );
    if (!user) {
      return NextResponse.json({ found: false, bonusBalance: 0 });
    }

    return NextResponse.json({
      found: true,
      bonusBalance: Math.floor(Number(user.bonusBalance) || 0),
    });
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) {
      return NextResponse.json({ error: 'Терминал заблокирован' }, { status: 401 });
    }
    console.error('Kiosk loyalty lookup error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
