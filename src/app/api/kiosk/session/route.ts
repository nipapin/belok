import { getCurrentUser } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { hasPermission, isStaff } from '@/lib/roles';
import { NextResponse } from 'next/server';
import { getKioskSettings, isKioskUnlocked } from '@/lib/kioskAuth';
import { aqsiConfigured, fiscalConfigured, getAqsiConfig } from '@/lib/aqsiConfig';

export async function GET() {
  try {
    const user = await getCurrentUser();
    const staff = isStaff(user) || user?.staffRoles != null;
    const staffUnlocked = hasPermission(user, 'cashier');
    const settings = await getKioskSettings();
    if (!settings && !staffUnlocked) {
      return NextResponse.json({ configured: false, unlocked: false });
    }
    const unlocked = staff ? staffUnlocked : await isKioskUnlocked();
    const aqsi = await getAqsiConfig();
    const cardBusy = await queryOne(`SELECT id FROM aqsi_jobs
      WHERE kind='CARD' AND state IN ('SUBMITTING','PROCESSING','UNKNOWN') LIMIT 1`);
    return NextResponse.json({ configured: true, unlocked, cardEnabled:!cardBusy && aqsiConfigured(aqsi) && aqsi.receiptsEnabled && fiscalConfigured(aqsi) });
  } catch (error) {
    console.error('Kiosk session error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
