/**
 * Custom Service Worker code injected into the next-pwa generated SW.
 * Configured via `workboxOptions: { ... }` + `customWorkerSrc: 'src/worker'`
 * in `next.config.ts`.
 *
 * This file runs in the ServiceWorkerGlobalScope — NO `window`, NO React,
 * NO DOM access. Only `self`, `clients`, `caches`, fetch, IndexedDB, etc.
 *
 * What it does:
 *  - On `push` event: parse JSON payload, show a system notification.
 *  - On `notificationclick`: focus an existing tab (if any) or open the URL.
 */

// Force this file to be treated as a module so the `declare const self` below
// is module-scoped and doesn't collide with the global `self: Window` from
// lib.dom (which TS picks because this project's tsconfig lib is DOM-based).
// Bundler strips this empty export from the emitted SW script.
export {};

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
}

const DEFAULT_ICON = '/icons/icon-192x192.png';
const DEFAULT_BADGE = '/icons/icon-96x96.png';

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    // Some push services may send plain text. Fall back to it as the body.
    payload = { title: 'бело́к', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'бело́к';
  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body || '',
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    // tag groups notifications — same tag replaces previous on the screen
    tag: payload.tag || 'default',
    data: { url: payload.url || '/' },
    // re-buzz the device even if a notification with the same tag already exists
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || '/';
  const targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Prefer focusing an already-open tab on the target URL.
      for (const client of all) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise reuse the first PWA window we find and navigate it.
      for (const client of all) {
        if ('navigate' in client && 'focus' in client) {
          await client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      // No window open at all → open a fresh one.
      return self.clients.openWindow(targetUrl);
    })()
  );
});
