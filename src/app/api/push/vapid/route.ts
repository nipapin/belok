import { NextResponse } from 'next/server';
import { getPublicVapidKey } from '@/lib/push';

/**
 * GET /api/push/vapid
 * Returns the VAPID public key so the client can call `pushManager.subscribe()`.
 * Public endpoint — the key is meant to be public.
 */
export async function GET() {
  try {
    const publicKey = getPublicVapidKey();
    return NextResponse.json({ publicKey });
  } catch (err) {
    console.error('[push/vapid]', err);
    return NextResponse.json(
      { error: 'Push-уведомления не настроены на сервере' },
      { status: 503 }
    );
  }
}
