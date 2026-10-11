import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getHitsConfig, getStoredHitsConfig, saveHitsConfig, sanitizeHitsConfig } from '@/lib/hits';
import { query } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await requireAdmin();
    const [resolved, stored] = await Promise.all([getHitsConfig(), getStoredHitsConfig()]);
    return NextResponse.json({ ...resolved, pinnedIds: stored.productIds });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return NextResponse.json({error:'Нет доступа'},{status:403});
    console.error('Admin hits GET error:',e);
    return NextResponse.json({error:'Ошибка сервера'},{status:500});
  }
}
export async function PUT(request:NextRequest) {
  try {
    await requireAdmin();
    const body=await request.json().catch(()=>null);
    if (!body || typeof body !== 'object') return NextResponse.json({error:'Некорректные данные'},{status:400});
    const next=sanitizeHitsConfig(body);
    const ids=[...new Set([...next.productIds,...next.excludedIds])];
    if(ids.length){
      const rows=await query<{id:string}>(`SELECT id FROM products WHERE id=ANY($1::text[])`,[ids]);
      const existing=new Set(rows.map(row=>row.id));
      next.productIds=next.productIds.filter(id=>existing.has(id));
      next.excludedIds=next.excludedIds.filter(id=>existing.has(id));
    }
    next.productIds=next.productIds.filter(id=>!next.excludedIds.includes(id));
    const result=await saveHitsConfig(next);
    return NextResponse.json({...result,pinnedIds:next.productIds});
  } catch(e) {
    if((e as Error).message==='UNAUTHORIZED') return NextResponse.json({error:'Нет доступа'},{status:403});
    console.error('Admin hits PUT error:',e);
    return NextResponse.json({error:'Ошибка сохранения'},{status:500});
  }
}
