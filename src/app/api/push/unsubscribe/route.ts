import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteSubscription } from '@/lib/push';

/**
 * POST /api/push/unsubscribe
 * Body: { endpoint: string }
 * Hard-deletes the subscription. Idempotent — deleting an unknown endpoint is a no-op.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  const endpoint = body?.endpoint?.toString();
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint обязателен' }, { status: 400 });
  }

  await deleteSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
