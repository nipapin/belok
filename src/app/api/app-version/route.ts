import { NextResponse } from 'next/server';
import { buildVersion } from '@/lib/buildVersion';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(buildVersion, { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } });
}
