import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { buildVersion } from '@/lib/buildVersion';

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(buildVersion,{headers:{'Cache-Control':'private, no-store'}});
  } catch {
    return NextResponse.json({error:'Нет доступа'},{status:403,headers:{'Cache-Control':'private, no-store'}});
  }
}
