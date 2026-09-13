"use client";

/**
 * Fallback document for the service worker: `@ducanh2912/next-pwa` detects
 * `app/~offline/page` automatically, precaches it and serves it whenever a
 * navigation cannot reach the network. Without it the SW rejects the
 * navigation and the browser shows a raw "no-response" error page.
 *
 * Must stay self-contained: it is rendered while the device is offline, so no
 * data fetching and no dependency on the (client) layout.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Нет соединения</h1>
      <p className="max-w-xs text-sm text-(--lg-text-muted)">
        Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="lg-pill lg-interactive px-6 py-3 text-sm font-medium"
      >
        Повторить
      </button>
    </main>
  );
}
