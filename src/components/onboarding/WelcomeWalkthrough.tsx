"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Gift,
  Heart,
  Percent,
  QrCode,
  Rocket,
  Salad,
  Sparkles,
  Star,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useAuthModalStore } from "@/store/authModalStore";
import { useHaptic } from "@/hooks/useHaptic";
import { setOverlayOpen } from "@/lib/clientOverlay";
import { WALKTHROUGH_SEEN_KEY } from "@/lib/pwaInstall";
import type { WalkthroughConfig } from "@/lib/walkthrough";

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  salad: Salad,
  "qr-code": QrCode,
  "user-plus": UserRoundPlus,
  gift: Gift,
  star: Star,
  bell: Bell,
  heart: Heart,
  rocket: Rocket,
  percent: Percent,
};

function getSeenVersion(): number {
  try {
    const raw = localStorage.getItem(WALKTHROUGH_SEEN_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    // Storage unavailable (private mode) — pretend seen so we never loop.
    return Number.MAX_SAFE_INTEGER;
  }
}

function markSeen(version: number) {
  try {
    localStorage.setItem(WALKTHROUGH_SEEN_KEY, String(version));
  } catch {
    // Ignore — worst case the walkthrough shows again next visit.
  }
}

export default function WelcomeWalkthrough() {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();
  const haptic = useHaptic();
  const openAuth = useAuthModalStore((s) => s.openAuth);

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [slide, setSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const { data } = useQuery({
    queryKey: ["walkthrough"],
    queryFn: () => fetch("/api/walkthrough").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: !isLoading && !user,
  });
  const config = data?.config as WalkthroughConfig | undefined;

  useEffect(() => {
    if (isLoading || !config) return;
    if (user) {
      // Logged-in visitors are not new — never bother them with the intro.
      markSeen(config.version);
      return;
    }
    if (!config.enabled || config.slides.length === 0) return;
    if (getSeenVersion() >= config.version) return;
    setSlide(0);
    setOpen(true);
    // Two frames so the fade-in transition actually runs after mount.
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, [isLoading, user, config]);

  useEffect(() => {
    setOverlayOpen("walkthrough", open);
    return () => setOverlayOpen("walkthrough", false);
  }, [open]);

  if (!open || !config) return null;

  const slides = config.slides;
  const isLast = slide === slides.length - 1;

  const close = () => {
    markSeen(config.version);
    setVisible(false);
    window.setTimeout(() => setOpen(false), 250);
  };

  const goTo = (next: number) => {
    setSlide(Math.max(0, Math.min(slides.length - 1, next)));
  };

  const onNext = () => {
    haptic("light");
    goTo(slide + 1);
  };

  const onSkip = () => {
    haptic("selection");
    close();
  };

  const onRegister = () => {
    haptic("medium");
    close();
    openAuth({ preferRegister: true });
  };

  const onMenu = () => {
    haptic("light");
    close();
    router.push("/menu");
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    haptic("selection");
    goTo(delta < 0 ? slide + 1 : slide - 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Знакомство с приложением"
      className={`fixed inset-0 z-1200 flex touch-none flex-col items-center justify-center bg-black/30 px-4 backdrop-blur-xl transition-opacity duration-250 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="glass-panel-strong w-full max-w-sm overflow-hidden p-6 pb-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-(--lg-text-muted)">
            {slide + 1} / {slides.length}
          </span>
          {!isLast && (
            <button type="button" onClick={onSkip} className="btn-ghost border-0 px-2 py-1 text-xs">
              Пропустить
            </button>
          )}
        </div>

        <div className="overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${slide * 100}%)` }}
          >
            {slides.map(({ icon, title, text }, i) => {
              const Icon = ICONS[icon] ?? Sparkles;
              return (
                <div key={`${i}-${title}`} className="w-full shrink-0 py-4 text-center">
                  <span className="glass-fx mx-auto mb-5 flex size-16 items-center justify-center rounded-full text-(--lg-text)">
                    <Icon className="size-7" strokeWidth={1.5} />
                  </span>
                  <h2 className="heading-section mb-2">{title}</h2>
                  <p className="mx-auto max-w-[17rem] text-sm leading-relaxed text-(--lg-text-muted)">
                    {text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-4 mt-2 flex items-center justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={`${i}-${s.title}`}
              type="button"
              aria-label={`Шаг ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === slide ? "w-5 bg-(--lg-text)" : "w-1.5 bg-(--lg-text)/25"
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <div className="space-y-2">
            <button type="button" onClick={onRegister} className="btn-primary w-full py-3">
              <UserRoundPlus className="size-4" strokeWidth={1.75} />
              Создать аккаунт
            </button>
            <button type="button" onClick={onMenu} className="btn-ghost w-full py-3">
              Смотреть меню
            </button>
          </div>
        ) : (
          <button type="button" onClick={onNext} className="btn-primary w-full py-3">
            Далее
            <ArrowRight className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
