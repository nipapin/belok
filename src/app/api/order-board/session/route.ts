import { hasPermission } from '@/lib/roles';
import { NextResponse } from 'next/server';
import { boardAccess } from '@/lib/orderBoardAccess';
import { getKioskSettings } from '@/lib/kioskAuth';
export async function GET() {
  const access = await boardAccess();
  return NextResponse.json({ configured: access.unlocked || !!await getKioskSettings(), unlocked: access.unlocked, canComplete: access.canComplete, staff: !!access.user, canAvailability: hasPermission(access.user, 'availability') }, { headers: {'Cache-Control':'private, no-store'} });
}
