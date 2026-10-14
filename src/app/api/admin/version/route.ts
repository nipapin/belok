import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isStaff } from '@/lib/roles';
import { buildVersion } from '@/lib/buildVersion';

export async function GET() {
  try {
    if (!isStaff(await getCurrentUser())) throw new Error('UNAUTHORIZED');
    return NextResponse.json(buildVersion,{headers:{'Cache-Control':'private, no-store'}});
  } catch {
    return NextResponse.json({error:'Нет доступа'},{status:403,headers:{'Cache-Control':'private, no-store'}});
  }
}
