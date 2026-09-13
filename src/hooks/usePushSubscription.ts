"use client";

import { useCallback, useEffect, useState } from "react";
import { isIosDevice, isStandalonePwa } from "@/lib/clientPlatform";

export type PushPermission = "default" | "granted" | "denied";

export type PushStatus =
  | "loading" // initial check
  | "unsupported" // browser has no Notification or PushManager
  | "ios-needs-install" // iOS Safari but PWA not added to home screen
  | "denied" // user denied (permanent until manually re-enabled in OS settings)
  | "subscribed" // we have a subscription saved on the server
  | "not-subscribed"; // permission ok but no active subscription

const JSON_HEADERS = { "Content-Type": "application/json" };

// TS 5.7+: Uint8Array is generic over its backing buffer; default widens to
// ArrayBufferLike (= ArrayBuffer | SharedArrayBuffer). BufferSource — which
// PushManager.subscribe() wants — only accepts the ArrayBuffer variant, so
// allocate explicitly and pin the type parameter.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function windowPushManager(): PushManager | null {
  const extra = window as Window & { pushManager?: PushManager };
  return extra.pushManager ?? null;
}

function readyWithTimeout(ms: number): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("sw-timeout"));
    }, ms);
    navigator.serviceWorker.ready.then(
      (reg) => {
        window.clearTimeout(timer);
        resolve(reg);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function activateWaitingWorker(reg: ServiceWorkerRegistration): Promise<void> {
  if (!reg.waiting) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      window.clearTimeout(timer);
      resolve();
    };
    const onChange = () => done();
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    const timer = window.setTimeout(done, 1500);
  });
}

async function getPushManager(): Promise<PushManager> {
  const windowPm = windowPushManager();
  if (!("serviceWorker" in navigator)) {
    if (windowPm) return windowPm;
    throw new Error("no-push-manager");
  }

  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) {
    if (windowPm) return windowPm;
    throw new Error("sw-timeout");
  }

  await activateWaitingWorker(existing);
  try {
    const reg = await readyWithTimeout(8000);
    return reg.pushManager;
  } catch {
    if (windowPm) return windowPm;
    throw new Error("sw-timeout");
  }
}

async function persistSubscription(
  sub: PushSubscription,
  welcome: boolean
): Promise<Response> {
  return fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: JSON_HEADERS,
    body: JSON.stringify({ ...sub.toJSON(), welcome }),
  });
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
    if (!isPushSupported() && !windowPushManager()) {
      if (isIosDevice() && !isStandalonePwa()) {
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
      const pushManager = await getPushManager();
      const sub = await pushManager.getSubscription();
      if (!sub) {
        setStatus("not-subscribed");
        return;
      }
      setStatus("subscribed");
      // Apple rotates endpoints; re-POST on every launch so the server stays in sync.
      const saveRes = await persistSubscription(sub, false);
      if (!saveRes.ok && saveRes.status !== 401) {
        console.warn("[push] resync failed", saveRes.status);
      }
    } catch {
      setStatus("not-subscribed");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGE") {
        void refresh();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [refresh]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);

    try {
      if (!isPushSupported() && !windowPushManager()) {
        if (isIosDevice() && !isStandalonePwa()) {
          setError(
            "Чтобы получать уведомления на iPhone, добавьте приложение на домашний экран"
          );
          setStatus("ios-needs-install");
        } else {
          setError("Браузер не поддерживает push-уведомления");
          setStatus("unsupported");
        }
        return false;
      }

      // Must run in the same turn as the tap. Do not await anything first —
      // WebKit drops transient activation and then requestPermission() hangs
      // or returns "default" without a prompt.
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "not-subscribed");
        if (perm === "denied") {
          setError(
            "Уведомления отключены в системных настройках. Включите их вручную, чтобы продолжить."
          );
        }
        return false;
      }

      const vapidRes = await fetch("/api/push/vapid", {
        credentials: "include",
        cache: "no-store",
      });
      if (!vapidRes.ok) {
        setError("Сервер не настроен для push-уведомлений");
        return false;
      }
      const { publicKey } = (await vapidRes.json()) as { publicKey: string };

      const pushManager = await getPushManager();
      let sub = await pushManager.getSubscription();
      if (!sub) {
        try {
          sub = await pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        } catch {
          const existing = await pushManager.getSubscription();
          if (existing) await existing.unsubscribe().catch(() => {});
          sub = await pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }
      }

      const saveRes = await persistSubscription(sub, true);
      if (!saveRes.ok) {
        if (saveRes.status === 401) {
          setError("Войдите в аккаунт, чтобы включить уведомления");
        } else {
          setError("Не удалось сохранить подписку на сервере");
        }
        setStatus("not-subscribed");
        return false;
      }

      setStatus("subscribed");
      return true;
    } catch (e) {
      console.error("[push] enable failed", e);
      const message = e instanceof Error ? e.message : "";
      if (message === "sw-timeout") {
        setError(
          "Не удалось зарегистрировать сервис уведомлений. Откройте приложение с домашнего экрана по HTTPS и попробуйте снова."
        );
      } else {
        setError("Не удалось включить уведомления");
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const pushManager = await getPushManager();
      const sub = await pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: JSON_HEADERS,
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
