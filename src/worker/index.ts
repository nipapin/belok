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
  const title = nested?.title || payload.title || 'бело́к';
  const body = nested?.body || payload.body || '';
  const url = nested?.navigate || payload.url || '/';
  const tag = nested?.tag || payload.tag || 'default';

  // WebKit honours title/body/tag/data and ignores the rest. Keep the extra
  // fields for Android, but if showNotification rejects, retry with the
  // minimal set so a failed option never becomes a silent push (iOS revokes
  // the subscription after a few of those).
  const rich: NotificationOptions = {
    body,
    icon: nested?.icon || payload.icon || DEFAULT_ICON,
    badge: nested?.badge || payload.badge || DEFAULT_BADGE,
    tag,
    data: { url },
    lang: 'ru',
    dir: 'ltr',
  };

  try {
    await self.registration.showNotification(title, rich);
  } catch {
    await self.registration.showNotification(title, { body, tag, data: { url } });
  }

  const nav = self.navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
  };
  if (typeof nav.setAppBadge === 'function') {
    await nav.setAppBadge(1).catch(() => {});
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

  const target = (event.notification.data && event.notification.data.url) || '/';
  const targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      for (const client of all) {
        if ('navigate' in client && 'focus' in client) {
          await client.navigate(targetUrl).catch(() => {});
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
