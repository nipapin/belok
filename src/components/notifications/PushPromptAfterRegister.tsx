"use client";

import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useAuthStore } from "@/store/authStore";
import { useHaptic } from "@/hooks/useHaptic";

const FLAG = "belok_just_registered";
const DECISION_FLAG = "belok_push_prompt_shown";

/**
 * Modal that appears once, after a successful registration / first verification,
 * inviting the user to enable push notifications. Only shown if:
 *   - the user is logged in
 *   - the auth flow set the `belok_just_registered` sessionStorage flag
 *   - we haven't already asked in this browser (localStorage decision flag)
 *   - the browser actually supports push (or we can guide iOS users)
 */
export default function PushPromptAfterRegister() {
  const user = useAuthStore((s) => s.user);
  const { status, busy, enable } = usePushSubscription();
  const haptic = useHaptic();
  const [open, setOpen] = useState(false);

  // Decide whether to open exactly once per browser per registration.
  useEffect(() => {
    if (!user) return;
    let justRegistered = false;
    try {
      justRegistered = sessionStorage.getItem(FLAG) === "1";
      if (justRegistered) sessionStorage.removeItem(FLAG);
    } catch {
      /* ignore */
    }
    if (!justRegistered) return;

    // Don't pester: if we already asked in this browser, skip.
    let alreadyAsked = false;
    try {
      alreadyAsked = localStorage.getItem(DECISION_FLAG) === "1";
    } catch {
      /* ignore */
    }
    if (alreadyAsked) return;

    // Wait for the subscription state to settle.
    if (status === "loading") return;

    // Already subscribed → no need to ask.
    if (status === "subscribed") return;

    // Permission already permanently denied → asking won't change anything.
    if (status === "denied") return;

    setOpen(true);
  }, [user, status]);

  const remember = () => {
    try {
      localStorage.setItem(DECISION_FLAG, "1");
    } catch {
      /* ignore */
    }
  };

  const close = () => {
    haptic("selection");
    remember();
    setOpen(false);
  };

  const handleEnable = async () => {
    haptic("medium");
    await enable();
    remember();
    setOpen(false);
  };

  if (!open) return null;

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
              Включить уведомления?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-(--lg-text-muted)">
              Расскажем когда заказ будет готов, начислим бонусы и предупредим о
              специальных предложениях. Без спама.
            </p>
          </div>

          {status === "ios-needs-install" ? (
            <div className="w-full rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-left text-sm text-sky-100">
              Чтобы получать уведомления на iPhone, добавьте приложение на
              домашний экран: <b>Поделиться</b> → <b>На экран «Домой»</b>.
            </div>
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
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="btn-ghost flex-1"
              >
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
