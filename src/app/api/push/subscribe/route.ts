import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { upsertSubscription } from '@/lib/push';

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/**
 * POST /api/push/subscribe
 * Body: PushSubscription.toJSON() shape
 * Persists / refreshes the subscription for the currently logged-in user.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as SubscribeBody | null;
  const endpoint = body?.endpoint?.toString();
  const p256dh = body?.keys?.p256dh?.toString();
  const auth = body?.keys?.auth?.toString();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Невалидная подписка' }, { status: 400 });
  }

  await upsertSubscription({
    userId: user.id,
    endpoint,
    p256dh,
    auth,
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({ ok: true });
}
