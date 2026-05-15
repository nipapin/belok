"use client";

import { useCallback, useEffect, useState } from "react";

export type PushPermission = "default" | "granted" | "denied";

export type PushStatus =
  | "loading" // initial check
  | "unsupported" // browser has no Notification or PushManager
  | "ios-needs-install" // iOS Safari but PWA not added to home screen
  | "denied" // user denied (permanent until manually re-enabled in OS settings)
  | "subscribed" // we have a subscription saved on the server
  | "not-subscribed"; // permission ok but no active subscription

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPad =
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  return /iPhone|iPod|iPad/.test(ua) || iPad;
}

function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  // iOS-specific
  if (
    "standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone
  ) {
    return true;
  }
  // Standards-based
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Manages the lifetime of a Web Push subscription bound to the current user.
 *
 * Returns:
 *   - status: high-level state for the UI to render
 *   - permission: raw browser-level Notification permission
 *   - enable(): triggers the OS prompt and, on grant, subscribes + POSTs to /api/push/subscribe
 *   - disable(): unsubscribes locally and DELETEs from the server
 *   - busy: in-flight flag for either action
 *   - error: last user-actionable message
 */
export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [permission, setPermission] = useState<PushPermission>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    if (!isPushSupported()) {
      // iOS Safari pre-16.4 has no PushManager. iOS 16.4+ has it but only
      // exposes it in standalone PWA context.
      if (isIOSSafari() && !isStandalonePWA()) {
        setStatus("ios-needs-install");
      } else {
        setStatus("unsupported");
      }
      return;
    }
    const perm = Notification.permission as PushPermission;
    setPermission(perm);
    if (perm === "denied") {
      setStatus("denied");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "not-subscribed");
    } catch {
      setStatus("not-subscribed");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      if (!isPushSupported()) {
        if (isIOSSafari() && !isStandalonePWA()) {
          setError(
            "Чтобы получать уведомления на iPhone, добавьте приложение на домашний экран"
          );
          setStatus("ios-needs-install");
        } else {
          setError("Браузер не поддерживает push-уведомления");
          setStatus("unsupported");
        }
        return;
      }

      // Step 1 — ask OS for permission. Must be from a user gesture.
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "not-subscribed");
        if (perm === "denied") {
          setError(
            "Уведомления отключены в системных настройках. Включите их вручную, чтобы продолжить."
          );
        }
        return;
      }

      // Step 2 — fetch the VAPID public key from server.
      const vapidRes = await fetch("/api/push/vapid");
      if (!vapidRes.ok) {
        setError("Сервер не настроен для push-уведомлений");
        return;
      }
      const { publicKey } = (await vapidRes.json()) as { publicKey: string };

      // Step 3 — subscribe via the active service worker.
      const reg = await navigator.serviceWorker.ready;

      // If the user already had a subscription with a different VAPID key,
      // we have to drop it first — otherwise Push API throws InvalidStateError.
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe().catch(() => {});
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Step 4 — register on server.
      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!saveRes.ok) {
        // Roll back the local subscription so we stay consistent.
        await sub.unsubscribe().catch(() => {});
        setError("Не удалось сохранить подписку на сервере");
        setStatus("not-subscribed");
        return;
      }

      setStatus("subscribed");
    } catch (e) {
      console.error("[push] enable failed", e);
      setError("Не удалось включить уведомления");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setStatus("not-subscribed");
    } catch (e) {
      console.error("[push] disable failed", e);
      setError("Не удалось отключить уведомления");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return { status, permission, busy, error, enable, disable, refresh };
}
