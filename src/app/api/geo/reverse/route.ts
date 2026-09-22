import { NextRequest, NextResponse } from 'next/server';
import { reverseKaliningrad } from '@/lib/mapbox';

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get('lat'));
  const lon = Number(request.nextUrl.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ item: null });

  try {
    const item = await reverseKaliningrad(lat, lon);
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ item: null });
  }
}
