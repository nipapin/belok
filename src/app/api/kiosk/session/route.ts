import { NextResponse } from 'next/server';
import { getKioskSettings, isKioskUnlocked } from '@/lib/kioskAuth';

export async function GET() {
  try {
    const settings = await getKioskSettings();
    if (!settings) {
      return NextResponse.json({ configured: false, unlocked: false });
    }
    const unlocked = await isKioskUnlocked();
    return NextResponse.json({ configured: true, unlocked });
  } catch (error) {
    console.error('Kiosk session error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
