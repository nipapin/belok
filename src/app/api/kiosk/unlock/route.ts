import { NextRequest, NextResponse } from 'next/server';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';
import {
  getKioskSettings,
  isValidKioskPin,
  setKioskCookieOnResponse,
  verifyKioskPin,
} from '@/lib/kioskAuth';

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const limited = rateLimit(`kiosk-unlock:${ip}`, 10, 60);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: `Слишком много попыток. Попробуйте через ${limited.retryAfterSec} с` },
      { status: 429 }
    );
  }

  try {
    const settings = await getKioskSettings();
    if (!settings) {
      return NextResponse.json({ error: 'Терминал ещё не настроен' }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as { pin?: unknown } | null;
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
    if (!isValidKioskPin(pin)) {
      return NextResponse.json({ error: 'Неверный PIN' }, { status: 401 });
    }

    const ok = await verifyKioskPin(pin);
    if (!ok) {
      return NextResponse.json({ error: 'Неверный PIN' }, { status: 401 });
    }

    const response = NextResponse.json({ unlocked: true });
    setKioskCookieOnResponse(response, request, settings.pinHash);
    return response;
  } catch (error) {
    console.error('Kiosk unlock error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
