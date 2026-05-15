"use client";

import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import Switch from "@/components/ui/Switch";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useHaptic } from "@/hooks/useHaptic";

export default function PushToggle() {
  const { status, busy, error, enable, disable } = usePushSubscription();
  const haptic = useHaptic();

  const isOn = status === "subscribed";
  const showSwitch =
    status === "subscribed" || status === "not-subscribed" || status === "loading";

  const handleToggle = async (next: boolean) => {
    haptic("selection");
    if (next) await enable();
    else await disable();
  };

  return (
    <div className="glass-panel p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
            isOn
              ? "bg-emerald-500/14 text-emerald-400 ring-1 ring-emerald-500/24"
              : "bg-(--lg-fill) text-(--lg-text-muted) ring-1 ring-(--lg-ring)"
          }`}
        >
          {isOn ? (
            <Bell className="size-5" strokeWidth={1.75} />
          ) : (
            <BellOff className="size-5" strokeWidth={1.75} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight text-(--lg-text)">
                Push-уведомления
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-(--lg-text-muted)">
                {isOn
                  ? "Будем оповещать о статусе заказа, бонусах и спецпредложениях."
                  : "Включите, чтобы получать оповещения о заказах, бонусах и предложениях."}
              </p>
            </div>

            {showSwitch && (
              <div className="shrink-0">
                {busy || status === "loading" ? (
                  <div className="flex h-8 w-12 items-center justify-center">
                    <Loader2 className="size-4 animate-spin text-(--lg-text-muted)" />
                  </div>
                ) : (
                  <Switch
                    id="push-toggle"
                    checked={isOn}
                    onChange={handleToggle}
                    aria-label={isOn ? "Выключить уведомления" : "Включить уведомления"}
                  />
                )}
              </div>
            )}
          </div>

          {status === "ios-needs-install" && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-sm">
              <Smartphone className="mt-0.5 size-4 shrink-0 text-sky-400" />
              <p className="text-sky-100">
                Для уведомлений на iPhone сначала добавьте приложение на домашний экран:
                в Safari нажмите <b>Поделиться</b> → <b>На экран «Домой»</b>.
              </p>
            </div>
          )}

          {status === "denied" && (
            <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100">
              Уведомления заблокированы в системе. Включите их вручную в настройках
              телефона / браузера, после чего вернитесь сюда.
            </div>
          )}

          {status === "unsupported" && (
            <div className="mt-3 rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-3 py-2.5 text-sm text-(--lg-text-muted)">
              Этот браузер не поддерживает push-уведомления.
            </div>
          )}

          {error && (
            <div className="mt-3 auth-alert-error">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
