import { NextResponse } from 'next/server';
import { getKioskSettings, isKioskUnlocked } from '@/lib/kioskAuth';
import { aqsiConfigured, fiscalConfigured, getAqsiConfig } from '@/lib/aqsiConfig';

export async function GET() {
  try {
    const settings = await getKioskSettings();
    if (!settings) {
      return NextResponse.json({ configured: false, unlocked: false });
    }
    const unlocked = await isKioskUnlocked();
    const aqsi = await getAqsiConfig();
    return NextResponse.json({ configured: true, unlocked, cardEnabled:aqsiConfigured(aqsi) && aqsi.receiptsEnabled && fiscalConfigured(aqsi) });
  } catch (error) {
    console.error('Kiosk session error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
