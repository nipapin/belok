"use client";

import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useAuthStore } from "@/store/authStore";
import { useHaptic } from "@/hooks/useHaptic";

/** Set on successful login / email verification before redirect. */
export const PUSH_PROMPT_AUTH_FLAG = "belok_show_push_prompt";
const SESSION_DISMISSED = "belok_push_dismissed_session";

/**
 * Modal after sign-in (or once per session) inviting the user to enable push.
 * - permission "default" → OS prompt via «Включить»
 * - permission "denied" → reminder only (settings hint)
 */
export default function PushPromptAfterRegister() {
  const user = useAuthStore((s) => s.user);
  const { status, busy, enable } = usePushSubscription();
  const haptic = useHaptic();
  const [open, setOpen] = useState(false);
  const [reminderOnly, setReminderOnly] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (status === "loading") return;
    if (status === "subscribed") return;

    let afterAuth = false;
    try {
      afterAuth = sessionStorage.getItem(PUSH_PROMPT_AUTH_FLAG) === "1";
      if (afterAuth) sessionStorage.removeItem(PUSH_PROMPT_AUTH_FLAG);
    } catch {
      /* ignore */
    }

    let dismissedThisSession = false;
    try {
      dismissedThisSession = sessionStorage.getItem(SESSION_DISMISSED) === "1";
    } catch {
      /* ignore */
    }

    if (status === "denied") {
      if (!afterAuth) return;
      setReminderOnly(true);
      setOpen(true);
      return;
    }

    if (status === "ios-needs-install") {
      if (!afterAuth && dismissedThisSession) return;
      setReminderOnly(false);
      setOpen(true);
      return;
    }

    if (afterAuth) {
      setReminderOnly(false);
      setOpen(true);
      return;
    }

    if (!dismissedThisSession && status === "not-subscribed") {
      setReminderOnly(false);
      setOpen(true);
    }
  }, [user, status]);

  const dismissSession = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISSED, "1");
    } catch {
      /* ignore */
    }
  };

  const close = () => {
    haptic("selection");
    dismissSession();
    setOpen(false);
  };

  const handleEnable = async () => {
    haptic("medium");
    await enable();
    dismissSession();
    setOpen(false);
  };

  if (!open) return null;

  const title = reminderOnly
    ? "Включите уведомления"
    : "Включить уведомления?";
  const body = reminderOnly
    ? "Так вы ничего не пропустите: статус заказа, бонусы и акции. Разрешение можно включить в настройках браузера для этого сайта."
    : "Расскажем, когда заказ будет готов, начислим бонусы и предупредим о специальных предложениях. Без спама.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-prompt-title"
      className="fixed inset-0 z-1400 flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={close}
      />
      <div className="glass-panel-strong relative z-1 w-full max-w-md rounded-3xl p-6 shadow-2xl">
        <button
          type="button"
          onClick={close}
          aria-label="Закрыть"
          className="btn-icon absolute right-3 top-3 size-8"
        >
          <X className="size-4" strokeWidth={2} />
        </button>

        <div className="flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden
            className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/14 text-emerald-400 ring-1 ring-emerald-500/24"
          >
            <Bell className="size-7" strokeWidth={1.75} />
          </span>
          <div>
            <h2
              id="push-prompt-title"
              className="text-lg font-semibold tracking-tight text-(--lg-text)"
            >
              {title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-(--lg-text-muted)">{body}</p>
          </div>

          {status === "ios-needs-install" ? (
            <div className="w-full rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-left text-sm text-sky-100">
              Чтобы получать уведомления на iPhone, добавьте приложение на домашний экран:{" "}
              <b>Поделиться</b> → <b>На экран «Домой»</b>.
            </div>
          ) : reminderOnly ? (
            <button type="button" onClick={close} className="btn-primary w-full px-5 py-2.5 text-sm">
              Понятно
            </button>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleEnable}
                disabled={busy}
                className="btn-primary flex-1 px-5 py-2.5 text-sm"
              >
                {busy ? "Включаем…" : "Включить"}
              </button>
              <button type="button" onClick={close} disabled={busy} className="btn-ghost flex-1">
                Не сейчас
              </button>
            </div>
          )}

          <p className="text-xs text-(--lg-text-muted)">
            Управлять уведомлениями всегда можно в профиле
          </p>
        </div>
      </div>
    </div>
  );
}
