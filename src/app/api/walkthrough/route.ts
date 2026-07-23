import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import {
  WALKTHROUGH_SETTING_KEY,
  defaultWalkthroughConfig,
  type WalkthroughConfig,
} from '@/lib/walkthrough';

/**
 * GET /api/walkthrough
 * Public: welcome-walkthrough config for the client onboarding overlay.
 */
export async function GET() {
  try {
    const row = await queryOne<{ value: WalkthroughConfig }>(
      `SELECT value FROM "app_settings" WHERE key = $1`,
      [WALKTHROUGH_SETTING_KEY]
    );
    return NextResponse.json({ config: row?.value ?? defaultWalkthroughConfig });
  } catch (e) {
    console.error('Walkthrough config error:', e);
    // Never break first paint over onboarding content — fall back to defaults.
    return NextResponse.json({ config: defaultWalkthroughConfig });
  }
}
