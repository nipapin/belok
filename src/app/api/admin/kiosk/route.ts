import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getKioskSettings, isValidKioskPin, setKioskPin } from '@/lib/kioskAuth';
import { listKioskClients, requestKioskRefresh, validKioskClientId } from '@/lib/kioskControl';
import { buildVersion } from '@/lib/buildVersion';

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getKioskSettings();
    return NextResponse.json({ configured: Boolean(settings),clients:await listKioskClients(),revision:buildVersion.revision },{headers:{'Cache-Control':'private, no-store'}});
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request:NextRequest) {
  try {
    await requireAdmin();
    const body=await request.json().catch(()=>null) as {action?:unknown;clientId?:unknown}|null;
    if(body?.action!=='refresh' || (body.clientId!=null && !validKioskClientId(body.clientId))) {
      return NextResponse.json({error:'Неизвестное действие'},{status:400});
    }
    const command=await requestKioskRefresh(body.clientId ?? undefined);
    return NextResponse.json({command},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    return NextResponse.json({error:(error as Error).message==='UNAUTHORIZED' ? 'Нет доступа' : 'Не удалось отправить обновление'},
      {status:(error as Error).message==='UNAUTHORIZED' ? 403 : 500});
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
