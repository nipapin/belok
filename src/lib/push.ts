import 'server-only';
import webpush, { type SendResult, type WebPushError } from 'web-push';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from './db';

// ---------------------------------------------------------------------------
// VAPID configuration. Configured lazily on first call so missing env vars
// don't crash the entire app at import time — they only crash the push code path.
// ---------------------------------------------------------------------------

let vapidConfigured = false;

const DEFAULT_PUBLIC_ORIGIN = 'https://belok.pro';

export type PushPayload = {
  /** Заголовок (1-я строка), напр. «Заказ готов!» */
  title: string;
  /** Подпись, до 2 строк */
  body: string;
  /** Куда вести по тапу. По умолчанию — корень PWA. */
  url?: string;
  /** Произвольный группирующий тег — новые с тем же tag заменяют старые на экране. */
  tag?: string;
  /** Иконка (по умолчанию /icons/icon-192x192.png — задаётся в SW) */
  icon?: string;
};

function configureVapid(): void {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@example.com').trim();
  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID keys are not configured. Run `npm run push:keys` and add NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to .env.'
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

/** Public HTTPS origin of the installed PWA. Needed for Declarative Web Push `navigate`. */
export function getPublicAppOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (raw && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(raw)) {
    return raw;
  }
  return DEFAULT_PUBLIC_ORIGIN;
}

/** Origin the client actually used (LAN IP, preview host, production). */
export function originFromRequest(request: { headers: Headers; nextUrl: URL }): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`;
  }
  const host = request.headers.get('host')?.split(',')[0]?.trim();
  if (host) {
    const proto = request.nextUrl.protocol.replace(/:$/, '') || 'https';
    return `${proto}://${host}`;
  }
  return request.nextUrl.origin.replace(/\/$/, '');
}

export function toPushPath(url?: string): string {
  if (!url) return '/';
  try {
    if (/^https?:\/\//i.test(url)) {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    }
  } catch {
    return '/';
  }
  return url.startsWith('/') ? url : `/${url}`;
}

export function absolutePushUrl(
  path: string,
  request: { headers: Headers; nextUrl: URL }
): string {
  return `${originFromRequest(request)}${toPushPath(path)}`;
}

function resolvePushNavigateUrl(path?: string): string {
  if (path && /^https?:\/\//i.test(path)) return path;
  const origin = getPublicAppOrigin();
  return `${origin}${toPushPath(path)}`;
}

/**
 * Dual payload: Declarative Web Push (iOS 18.4+) plus the flat fields our
 * service worker already reads. If the SW fails to call showNotification in
 * time, WebKit still displays `notification` instead of dropping the push.
 *
 * `navigate` must be an absolute same-origin URL — a relative path is resolved
 * against the wrong base on iOS and opens a Next.js 404.
 */
function serializePushPayload(payload: PushPayload): string {
  const path = toPushPath(payload.url);
  const navigate = resolvePushNavigateUrl(payload.url);
  return JSON.stringify({
    web_push: 8030,
    notification: {
      title: payload.title,
      body: payload.body,
      lang: 'ru',
      dir: 'ltr',
      navigate,
      tag: payload.tag || 'default',
      silent: false,
    },
    title: payload.title,
    body: payload.body,
    url: path,
    tag: payload.tag,
    icon: payload.icon,
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AudienceType = 'ALL' | 'LOYALTY_LEVEL' | 'USER';

export type Audience =
  | { type: 'ALL' }
  | { type: 'LOYALTY_LEVEL'; loyaltyLevelId: string }
  | { type: 'USER'; userId: string };

interface SubscriptionRow {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ---------------------------------------------------------------------------
// Audience resolver — turns an Audience descriptor into a list of userIds.
// ---------------------------------------------------------------------------

export async function resolveAudienceUserIds(audience: Audience): Promise<string[]> {
  if (audience.type === 'USER') {
    return [audience.userId];
  }
  if (audience.type === 'LOYALTY_LEVEL') {
    const rows = await query<{ id: string }>(
      `SELECT id FROM "users" WHERE "loyaltyLevelId" = $1`,
      [audience.loyaltyLevelId]
    );
    return rows.map((r) => r.id);
  }
  // ALL — every user that has at least one subscription. (No point sending to users
  // without a subscription — they can't receive anyway.)
  const rows = await query<{ id: string }>(
    `SELECT DISTINCT u.id
       FROM "users" u
       JOIN "push_subscriptions" s ON s."userId" = u.id`
  );
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Low-level: send to one subscription. Cleans up dead endpoints (404/410).
// ---------------------------------------------------------------------------

async function sendToOneSubscription(
  sub: SubscriptionRow,
  payload: PushPayload
): Promise<SendResult | null> {
  configureVapid();
  try {
    const result = await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      serializePushPayload(payload),
      {
        TTL: 60 * 60 * 24,
        urgency: 'high',
        contentEncoding: 'aes128gcm',
      }
    );
    console.info('[push] delivered', {
      userId: sub.userId,
      statusCode: result.statusCode,
      endpoint: sub.endpoint.slice(0, 48),
    });
    return result;
  } catch (err) {
    const pushErr = err as WebPushError & { body?: string; message?: string };
    const code = pushErr?.statusCode;
    // 404 / 410 = subscription is gone (user uninstalled, denied, expired).
    if (code === 404 || code === 410) {
      console.warn('[push] stale subscription removed', {
        code,
        userId: sub.userId,
        endpoint: sub.endpoint.slice(0, 48),
      });
      await query(`DELETE FROM "push_subscriptions" WHERE endpoint = $1`, [sub.endpoint]);
      return null;
    }
    // 413 = payload too large; 429 = rate limited; others — log & continue.
    console.warn('[push] sendNotification failed', {
      code,
      userId: sub.userId,
      endpoint: sub.endpoint.slice(0, 48),
      body: typeof pushErr?.body === 'string' ? pushErr.body.slice(0, 200) : undefined,
      message: pushErr?.message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// High-level: send to a list of users. Returns count of successful deliveries.
// ---------------------------------------------------------------------------

export async function sendPushToUserIds(
  userIds: string[],
  payload: PushPayload
): Promise<{ recipients: number; delivered: number }> {
  if (userIds.length === 0) {
    console.info('[push] skip: empty audience', { title: payload.title });
    return { recipients: 0, delivered: 0 };
  }

  const subs = await query<SubscriptionRow>(
    `SELECT id, "userId", endpoint, p256dh, auth
       FROM "push_subscriptions"
      WHERE "userId" = ANY($1::text[])`,
    [userIds]
  );

  console.info('[push] sending', {
    title: payload.title,
    users: userIds.length,
    subscriptions: subs.length,
  });

  if (subs.length === 0) {
    console.warn('[push] no subscriptions for audience', {
      title: payload.title,
      users: userIds.length,
    });
    return { recipients: userIds.length, delivered: 0 };
  }

  // Fan out in parallel; web-push is non-blocking for our process.
  const results = await Promise.all(subs.map((sub) => sendToOneSubscription(sub, payload)));
  const delivered = results.filter((r) => r !== null).length;

  console.info('[push] done', {
    title: payload.title,
    recipients: userIds.length,
    subscriptions: subs.length,
    delivered,
  });

  return { recipients: userIds.length, delivered };
}

export async function sendPushToAudience(
  audience: Audience,
  payload: PushPayload
): Promise<{ recipients: number; delivered: number }> {
  const userIds = await resolveAudienceUserIds(audience);
  return sendPushToUserIds(userIds, payload);
}

// ---------------------------------------------------------------------------
// Convenience for system events (single user) that should fail silently —
// we don't want a missing VAPID key to crash an order-status update or a
// bonus award. Everything is best-effort.
// ---------------------------------------------------------------------------

export async function tryNotifyUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  try {
    await sendPushToUserIds([userId], payload);
  } catch (err) {
    console.warn('[push] tryNotifyUser failed', err);
  }
}

/** Best-effort fan-out to every ADMIN (kitchen / seller devices). */
export async function tryNotifyAdmins(payload: PushPayload): Promise<void> {
  try {
    const rows = await query<{ id: string }>(
      `SELECT id FROM "users" WHERE role = 'ADMIN'`
    );
    await sendPushToUserIds(
      rows.map((r) => r.id),
      payload
    );
  } catch (err) {
    console.warn('[push] tryNotifyAdmins failed', err);
  }
}

// ---------------------------------------------------------------------------
// History writer — for ADMIN broadcasts only. System events are NOT logged
// (would clutter the journal).
// ---------------------------------------------------------------------------

export async function recordBroadcast(args: {
  sentByUserId: string;
  payload: PushPayload;
  audience: Audience;
  recipients: number;
  delivered: number;
}): Promise<{ id: string }> {
  const id = uuidv4();
  const audienceValue =
    args.audience.type === 'USER'
      ? args.audience.userId
      : args.audience.type === 'LOYALTY_LEVEL'
        ? args.audience.loyaltyLevelId
        : null;

  await query(
    `INSERT INTO "push_notifications"
       (id, "sentByUserId", title, body, url, "audienceType", "audienceValue",
        "recipientCount", "deliveredCount")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      args.sentByUserId,
      args.payload.title,
      args.payload.body,
      args.payload.url ?? null,
      args.audience.type,
      audienceValue,
      args.recipients,
      args.delivered,
    ]
  );
  return { id };
}

// ---------------------------------------------------------------------------
// Subscription helpers (used by /api/push/subscribe and /api/push/unsubscribe).
// ---------------------------------------------------------------------------

export async function upsertSubscription(args: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  // endpoint has a UNIQUE constraint — if the same browser re-subscribes we
  // overwrite the keys (they may have rotated) and rebind to the current user.
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM "push_subscriptions" WHERE endpoint = $1`,
    [args.endpoint]
  );
  if (existing) {
    await query(
      `UPDATE "push_subscriptions"
          SET "userId" = $1, p256dh = $2, auth = $3, "userAgent" = $4
        WHERE endpoint = $5`,
      [args.userId, args.p256dh, args.auth, args.userAgent ?? null, args.endpoint]
    );
    return;
  }
  await query(
    `INSERT INTO "push_subscriptions"
       (id, "userId", endpoint, p256dh, auth, "userAgent")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv4(), args.userId, args.endpoint, args.p256dh, args.auth, args.userAgent ?? null]
  );
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await query(`DELETE FROM "push_subscriptions" WHERE endpoint = $1`, [endpoint]);
}

export function getPublicVapidKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!key) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
  }
  return key;
}
