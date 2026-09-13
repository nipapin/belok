import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getKioskSettings, isValidKioskPin, setKioskPin } from '@/lib/kioskAuth';

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getKioskSettings();
    return NextResponse.json({ configured: Boolean(settings) });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => null)) as { pin?: unknown } | null;
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';

    if (!isValidKioskPin(pin)) {
      return NextResponse.json(
        { error: 'PIN должен состоять из 4–6 цифр' },
        { status: 400 }
      );
    }

    await setKioskPin(pin);
    return NextResponse.json({ configured: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Save kiosk PIN error:', e);
    return NextResponse.json({ error: 'Ошибка сохранения' }, { status: 500 });
  }
}
