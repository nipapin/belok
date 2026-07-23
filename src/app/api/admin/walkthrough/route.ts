import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import {
  WALKTHROUGH_SETTING_KEY,
  defaultWalkthroughConfig,
  sanitizeWalkthroughSlides,
  type WalkthroughConfig,
} from '@/lib/walkthrough';

async function readConfig(): Promise<WalkthroughConfig> {
  const row = await queryOne<{ value: WalkthroughConfig }>(
    `SELECT value FROM "app_settings" WHERE key = $1`,
    [WALKTHROUGH_SETTING_KEY]
  );
  return row?.value ?? defaultWalkthroughConfig;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ config: await readConfig() });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin walkthrough GET error:', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

interface PutBody {
  enabled?: boolean;
  slides?: unknown;
  /** When true, the config version is bumped so users who saw the old intro see it again. */
  bumpVersion?: boolean;
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();

    const body = (await request.json().catch(() => null)) as PutBody | null;
    if (!body) {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
    }

    const slides = sanitizeWalkthroughSlides(body.slides);
    if (!slides) {
      return NextResponse.json(
        { error: 'Нужен хотя бы один слайд; заголовок до 80 символов, текст до 300' },
        { status: 400 }
      );
    }

    const current = await readConfig();
    const config: WalkthroughConfig = {
      enabled: body.enabled !== false,
      version: body.bumpVersion ? current.version + 1 : current.version,
      slides,
    };

    await query(
      `INSERT INTO "app_settings" ("key", "value", "updatedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT ("key") DO UPDATE SET "value" = $2, "updatedAt" = NOW()`,
      [WALKTHROUGH_SETTING_KEY, JSON.stringify(config)]
    );

    return NextResponse.json({ config });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Admin walkthrough PUT error:', e);
    return NextResponse.json({ error: 'Ошибка сохранения' }, { status: 500 });
  }
}
