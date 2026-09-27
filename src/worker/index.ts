/// <reference lib="webworker" />

/**
 * Custom Service Worker code injected into the next-pwa generated SW.
 * Configured via `customWorkerSrc: 'src/worker'` in `next.config.ts`.
 *
 * This file runs in the ServiceWorkerGlobalScope — NO `window`, NO React,
 * NO DOM access. Only `self`, `clients`, `caches`, fetch, IndexedDB, etc.
 *
 * What it does:
 *  - On `push`: parse JSON (flat or Declarative Web Push), show a system notification.
 *  - On `notificationclick`: focus an existing tab (if any) or open the URL.
 *  - On `pushsubscriptionchange`: ask open clients to re-save the subscription.
 */

export {};

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  web_push?: number;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  notification?: {
    title?: string;
    body?: string;
    navigate?: string;
    tag?: string;
    icon?: string;
    badge?: string;
  };
}

const DEFAULT_ICON = '/icons/icon-192x192.png';
const DEFAULT_BADGE = '/icons/icon-96x96.png';

function toPushPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '/';
  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    }
  } catch {
    return '/';
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function toSameOriginUrl(raw: unknown): string {
  return new URL(toPushPath(raw), self.location.origin).href;
}

/**
 * iOS 18.4+ draws a valid Declarative Web Push on its own. If the service
 * worker also calls showNotification, WebKit drops the system banner.
 */
function systemShowsDeclarativePush(): boolean {
  const match = self.navigator.userAgent.match(/(?:iPhone OS|CPU OS) (\d+)_(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 18 || (major === 18 && minor >= 4);
}

function parsePushPayload(event: PushEvent): PushPayload {
  try {
    if (!event.data) return {};
    return event.data.json() as PushPayload;
  } catch {
    return { title: 'бело́к', body: event.data ? event.data.text() : '' };
  }
}

async function showPushNotification(event: PushEvent): Promise<void> {
  const payload = parsePushPayload(event);
  const nested = payload.notification;
  const declarative =
    payload.web_push === 8030 &&
    typeof nested?.title === 'string' &&
    nested.title.length > 0 &&
    typeof nested.navigate === 'string' &&
    nested.navigate.startsWith('https://');

  if (declarative && systemShowsDeclarativePush()) {
    return;
  }

  const title = nested?.title || payload.title || 'бело́к';
  const body = nested?.body || payload.body || '';
  const path = toPushPath(payload.url || nested?.navigate);
  const url = toSameOriginUrl(path);
  const tag = nested?.tag || payload.tag || 'default';
  const icon = toPushPath(nested?.icon || payload.icon || DEFAULT_ICON);

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon,
    badge: DEFAULT_BADGE,
    tag,
    renotify: true,
    data: { url, path },
    lang: 'ru',
  };

  try {
    await self.registration.showNotification(title, options);
  } catch {
    await self.registration.showNotification(title, { body, tag, data: { url, path } });
  }

  const nav = self.navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
  };
  if (typeof nav.setAppBadge === 'function') {
    try {
      await nav.setAppBadge(1);
    } catch {
      // Badge is optional. A throw here must not fail the push event.
    }
  }
}

self.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(showPushNotification(event));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const nav = self.navigator as Navigator & {
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof nav.clearAppBadge === 'function') {
    void nav.clearAppBadge().catch(() => {});
  }

  const data = event.notification.data as { url?: string; path?: string } | undefined;
  const path = toPushPath(data?.path || data?.url);
  const targetUrl = toSameOriginUrl(path);

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        client.postMessage({ type: 'PUSH_NAVIGATE', url: path });
        if ('navigate' in client) {
          await client.navigate(targetUrl).catch(() => {});
        }
        if ('focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  const extendable = event as ExtendableEvent;
  extendable.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGE' });
      }
    })()
  );
});
