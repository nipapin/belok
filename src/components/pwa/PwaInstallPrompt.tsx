"use client";

import { Download, Share, Smartphone, SquarePlus, X } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useHaptic } from "@/hooks/useHaptic";
import type { ClientOs } from "@/lib/clientPlatform";

function GuideSteps({ os }: { os: ClientOs }) {
  if (os === "ios") {
    return (
      <ol className="space-y-3 text-sm leading-relaxed text-(--lg-text)">
        <li className="flex gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-(--lg-fill) text-xs font-bold">
            1
          </span>
          <span>
            Нажмите{" "}
            <Share className="mb-0.5 inline size-3.5" strokeWidth={2} />{" "}
            <b>Поделиться</b> внизу Safari
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-(--lg-fill) text-xs font-bold">
            2
          </span>
          <span>
            Выберите <b>На экран «Домой»</b>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-(--lg-fill) text-xs font-bold">
            3
          </span>
          <span>
            Подтвердите <b>Добавить</b> — иконка появится рядом с приложениями
          </span>
        </li>
      </ol>
    );
  }

  if (os === "android") {
    return (
      <ol className="space-y-3 text-sm leading-relaxed text-(--lg-text)">
        <li className="flex gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-(--lg-fill) text-xs font-bold">
            1
          </span>
          <span>
            Откройте меню браузера <b>⋮</b> справа вверху
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-(--lg-fill) text-xs font-bold">
            2
          </span>
          <span>
            Нажмите <b>Установить приложение</b> или <b>На главный экран</b>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-(--lg-fill) text-xs font-bold">
            3
          </span>
          <span>Подтвердите установку — белок откроется как обычное приложение</span>
        </li>
      </ol>
    );
  }

  return (
    <ol className="space-y-3 text-sm leading-relaxed text-(--lg-text)">
      <li className="flex gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-(--lg-fill) text-xs font-bold">
          1
        </span>
        <span>
          Нажмите иконку установки в адресной строке или откройте меню браузера
        </span>
      </li>
      <li className="flex gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-(--lg-fill) text-xs font-bold">
          2
        </span>
        <span>
          Выберите <b>Установить «белок»</b>
        </span>
      </li>
    </ol>
  );
}

export default function PwaInstallPrompt() {
  const {
    os,
    showBanner,
    canNativeInstall,
    guideOpen,
    promptInstall,
    dismissBanner,
    openGuide,
    closeGuide,
  } = usePwaInstall();
  const haptic = useHaptic();

  const handlePrimary = async () => {
    haptic("medium");
    if (canNativeInstall) {
      const accepted = await promptInstall();
      if (accepted) {
        dismissBanner();
        closeGuide();
        return;
      }
    }
    openGuide();
  };

  const handleDismiss = () => {
    haptic("selection");
    dismissBanner();
  };

  const handleCloseGuide = () => {
    haptic("selection");
    closeGuide();
    dismissBanner();
  };

  return (
    <>
      {showBanner && !guideOpen ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
          style={{
            bottom:
              "calc(var(--client-nav-clearance) + var(--client-bottom-action, 0px))",
          }}
        >
          <div className="pointer-events-auto glass-panel-strong flex w-full max-w-md items-start gap-3 rounded-2xl p-3 shadow-(--lg-shadow-strong)">
            <span
              aria-hidden
              className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/14 text-emerald-500 ring-1 ring-emerald-500/24"
            >
              <Smartphone className="size-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight text-(--lg-text)">
                На домашний экран
              </p>
              <p className="mt-0.5 text-xs leading-snug text-(--lg-text-muted)">
                Уведомления о заказах и меню всегда под рукой
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary h-8 px-3 text-xs"
                  onClick={() => void handlePrimary()}
                >
                  {canNativeInstall ? (
                    <Download className="size-3.5" strokeWidth={2} />
                  ) : (
                    <SquarePlus className="size-3.5" strokeWidth={2} />
                  )}
                  {canNativeInstall ? "Установить" : "Как установить"}
                </button>
                <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={handleDismiss}>
                  Позже
                </button>
              </div>
            </div>
            <button
              type="button"
              className="btn-icon size-8 min-h-0 min-w-0 shrink-0"
              onClick={handleDismiss}
              aria-label="Закрыть"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}

      {guideOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          className="fixed inset-0 z-1400 flex items-end justify-center p-4 sm:items-center"
        >
          <button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={handleCloseGuide}
          />
          <div className="glass-panel-strong relative z-1 w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <button
              type="button"
              onClick={handleCloseGuide}
              aria-label="Закрыть"
              className="btn-icon absolute right-3 top-3 size-8"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
            <div className="flex flex-col gap-4">
              <span
                aria-hidden
                className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/14 text-emerald-400 ring-1 ring-emerald-500/24"
              >
                <Smartphone className="size-7" strokeWidth={1.75} />
              </span>
              <div>
                <h2
                  id="pwa-guide-title"
                  className="text-lg font-semibold tracking-tight text-(--lg-text)"
                >
                  Добавьте белок на рабочий стол
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-(--lg-text-muted)">
                  Так проще открывать меню и получать уведомления о заказах — без магазина
                  приложений.
                </p>
              </div>
              <GuideSteps os={os} />
              {canNativeInstall ? (
                <button
                  type="button"
                  className="btn-primary w-full py-3"
                  onClick={() => void handlePrimary()}
                >
                  <Download className="size-4" strokeWidth={2} />
                  Установить
                </button>
              ) : (
                <button type="button" className="btn-primary w-full py-3" onClick={handleCloseGuide}>
                  Понятно
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
