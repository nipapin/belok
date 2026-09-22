import { NextResponse } from 'next/server';
import { isHomePublished } from '@/lib/homeVisibility';

/** Public flag: whether the main page is shown or visitors are sent to /menu. */
export async function GET() {
  try {
    const published = await isHomePublished();
    return NextResponse.json(
      { published },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('Home published flag error:', e);
    return NextResponse.json(
      { published: false },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
