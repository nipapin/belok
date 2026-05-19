"use client";

import { useEffect } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { useHaptic } from "@/hooks/useHaptic";

export default function UpdateToast() {
  const { updateAvailable, reloading, applyUpdate, dismiss } =
    useServiceWorkerUpdate();
  const haptic = useHaptic();

  // One subtle tick when the toast first appears.
  useEffect(() => {
    if (updateAvailable) haptic("light");
  }, [updateAvailable, haptic]);

  if (!updateAvailable) return null;

  const onApply = () => {
    haptic("medium");
    applyUpdate();
  };

  const onDismiss = () => {
    haptic("selection");
    dismiss();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="update-toast pointer-events-none fixed left-1/2 z-1150 w-[calc(100%-1rem)] max-w-sm -translate-x-1/2 px-2"
      style={{
        top: "76px",
      }}
    >
      <div className="lg-bar pointer-events-auto flex items-center gap-3 px-3 py-2 pl-4">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/14 text-emerald-400 ring-1 ring-emerald-500/24"
        >
          <RefreshCw className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-(--lg-text)">
            Доступно обновление
          </p>
          <p className="truncate text-xs text-(--lg-text-muted)">
            Перезагрузим, чтобы получить новую версию
          </p>
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={reloading}
          className="btn-primary inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs"
        >
          {reloading ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
          ) : null}
          {reloading ? "Обновление…" : "Обновить"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Скрыть"
          disabled={reloading}
          className="btn-icon size-8 shrink-0"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
