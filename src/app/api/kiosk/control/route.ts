import { NextRequest, NextResponse } from 'next/server';
import { KioskUnauthorizedError, requireKioskUnlocked } from '@/lib/kioskAuth';
import { reportKioskClient, validKioskClientId } from '@/lib/kioskControl';

export async function POST(request:NextRequest) {
  try {
    await requireKioskUnlocked();
    const body=await request.json().catch(()=>null) as {
      id?:unknown;revision?:unknown;version?:unknown;busy?:unknown;lastRefreshId?:unknown;
    }|null;
    if(!body || !validKioskClientId(body.id) || typeof body.revision!=='string' ||
      !/^(?:[0-9a-f]{7,40}|local)$/i.test(body.revision) || typeof body.busy!=='boolean' ||
      (body.version!==undefined && (typeof body.version!=='string' || body.version.length>64 || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(body.version))) ||
      (body.lastRefreshId!==null && !validKioskClientId(body.lastRefreshId))) {
      return NextResponse.json({error:'Неверные данные киоска'},{status:400});
    }
    const command=await reportKioskClient({id:body.id,revision:body.revision,version:body.version as string|undefined,busy:body.busy,lastRefreshId:body.lastRefreshId});
    return NextResponse.json({command},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    return NextResponse.json({error:'Не удалось проверить обновление киоска'},
      {status:error instanceof KioskUnauthorizedError ? 401 : 500,headers:{'Cache-Control':'private, no-store'}});
  }
}
