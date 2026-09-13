import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import {
  HOME_LAYOUT_SETTING_KEY,
  defaultHomeLayout,
  sanitizeHomeLayout,
} from '@/lib/homeLayout';

/**
 * GET /api/home-layout
 * Public: home page block builder config for the client.
 */
export async function GET() {
  try {
    const row = await queryOne<{ value: unknown }>(
      `SELECT value FROM "app_settings" WHERE key = $1`,
      [HOME_LAYOUT_SETTING_KEY]
    );
    const config = sanitizeHomeLayout(row?.value) ?? defaultHomeLayout;
    return NextResponse.json({ config });
  } catch (e) {
    console.error('Home layout config error:', e);
    return NextResponse.json({ config: defaultHomeLayout });
  }
}
