import { NextResponse } from 'next/server';
import { getHitsConfig } from '@/lib/hits';

export async function GET() {
  try {
    const config = await getHitsConfig();
    return NextResponse.json(config);
  } catch (e) {
    console.error('Hits GET error:', e);
    return NextResponse.json({ productIds: [] });
  }
}
