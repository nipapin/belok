import { NextRequest, NextResponse } from 'next/server';
import { suggestKaliningrad } from '@/lib/mapbox';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ items: [] });

  try {
    const items = await suggestKaliningrad(q);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
