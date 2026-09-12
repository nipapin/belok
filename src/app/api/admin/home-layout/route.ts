import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import {
  HOME_LAYOUT_SETTING_KEY,
  defaultHomeLayout,
  sanitizeHomeBlocks,
  type HomeLayoutConfig,
} from '@/lib/homeLayout';

async function readConfig(): Promise<HomeLayoutConfig> {
  const row = await queryOne<{ value: HomeLayoutConfig }>(
    `SELECT value FROM "app_settings" WHERE key = $1`,
    [HOME_LAYOUT_SETTING_KEY]
  );
  return row?.value ?? defaultHomeLayout;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ config: await readConfig() });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin home-layout GET error:', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

interface PutBody {
  blocks?: unknown;
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();

    const body = (await request.json().catch(() => null)) as PutBody | null;
    if (!body) {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
    }

    const blocks = sanitizeHomeBlocks(body.blocks);
    if (!blocks) {
      return NextResponse.json(
        {
          error:
            'Некорректные блоки: до 20 штук, заголовок до 80 символов, до 10 картинок в галерее',
        },
        { status: 400 }
      );
    }

    const config: HomeLayoutConfig = { blocks };

    await query(
      `INSERT INTO "app_settings" ("key", "value", "updatedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT ("key") DO UPDATE SET "value" = $2, "updatedAt" = NOW()`,
      [HOME_LAYOUT_SETTING_KEY, JSON.stringify(config)]
    );

    return NextResponse.json({ config });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin home-layout PUT error:', e);
    return NextResponse.json({ error: 'Ошибка сохранения' }, { status: 500 });
  }
}
