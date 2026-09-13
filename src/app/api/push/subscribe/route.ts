import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { tryNotifyUser, upsertSubscription } from '@/lib/push';
import { getNotificationSettings } from '@/lib/notificationSettings';

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  welcome?: boolean;
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

  if (body?.welcome === true && (await getNotificationSettings()).autoPushWelcome) {
    const isAdmin = user.role === 'ADMIN';
    void tryNotifyUser(user.id, {
      title: 'Уведомления включены',
      body: isAdmin
        ? 'Так придёт оповещение, когда кто-то оформит заказ.'
        : 'Так мы сообщим, когда заказ будет готов.',
      url: isAdmin ? '/admin/orders' : '/',
      tag: 'push-enabled',
    });
  }

  return NextResponse.json({ ok: true });
}
