"use client";

import { useEffect, useState } from "react";
import type { Workbox } from "workbox-window";

declare global {
  interface Window {
    workbox?: Workbox;
  }
}

/**
 * Listens to the workbox-window instance exposed by `@ducanh2912/next-pwa`
 * and reports when a new service worker is installed and waiting.
 *
 * Lifecycle:
 *   1. SW detects updated `/sw.js` on the network → installs in background.
 *   2. With `skipWaiting: false` it goes to `waiting` state, NOT active.
 *   3. We expose `updateAvailable = true` and an `applyUpdate()` action.
 *   4. `applyUpdate()` calls `messageSkipWaiting()` → new SW activates.
 *   5. workbox-window fires `controlling` → we reload to pick up new assets.
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    // workbox-window may register asynchronously after window load — poll briefly.
    const tryAttach = (attempt = 0) => {
      const wb = window.workbox;
      if (!wb) {
        if (attempt < 20) setTimeout(() => tryAttach(attempt + 1), 250);
        return;
      }

      const onWaiting = () => {
        if (!cancelled) setUpdateAvailable(true);
      };
      const onControlling = () => {
        if (cancelled) return;
        // New SW is now in control — reload once so the page picks up new chunks.
        // Guard against the bfcache double-fire by tracking the reloading flag.
        if (!reloading) {
          window.location.reload();
        }
      };

      wb.addEventListener("waiting", onWaiting);
      wb.addEventListener("controlling", onControlling);

      // Periodically ask the SW to check for updates while the app is open
      // (e.g. user keeps PWA open for hours/days). Hourly is plenty.
      const checkInterval = window.setInterval(() => {
        wb.update().catch(() => {
          // Network errors etc. are non-fatal — workbox will retry on next visibility change.
        });
      }, 60 * 60 * 1000);

      // Also re-check when the tab regains focus (returning from background).
      const onVisible = () => {
        if (document.visibilityState === "visible") {
          wb.update().catch(() => {});
        }
      };
      document.addEventListener("visibilitychange", onVisible);

      return () => {
        wb.removeEventListener("waiting", onWaiting);
        wb.removeEventListener("controlling", onControlling);
        window.clearInterval(checkInterval);
        document.removeEventListener("visibilitychange", onVisible);
      };
    };

    const cleanup = tryAttach();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [reloading]);

  const applyUpdate = () => {
    const wb = window.workbox;
    if (!wb) return;
    setReloading(true);
    wb.messageSkipWaiting();
    // The `controlling` listener will reload us once the new SW takes over.
    // Belt-and-suspenders fallback in case the event never fires:
    window.setTimeout(() => window.location.reload(), 3000);
  };

  const dismiss = () => setUpdateAvailable(false);

  return { updateAvailable, reloading, applyUpdate, dismiss };
}
