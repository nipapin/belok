import { NextRequest, NextResponse } from 'next/server';
import { fetchMapbox, isMapboxHost } from '@/lib/mapboxUpstream';

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url');
  if (!raw) return new NextResponse(null, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (target.protocol !== 'https:' || !isMapboxHost(target.hostname)) {
    return new NextResponse(null, { status: 403 });
  }

  const token = process.env.MAPBOX_API_KEY?.trim();
  if (!token) return new NextResponse(null, { status: 503 });
  target.searchParams.set('access_token', token);

  try {
    const upstream = await fetchMapbox(target);
    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    headers.set('cache-control', upstream.headers.get('cache-control') || 'public, max-age=86400');
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, { status: upstream.status, headers });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
