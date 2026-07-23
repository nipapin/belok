"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, QrCode, Salad, Sparkles, UserRoundPlus } from "lucide-react";
import { brandMark } from "@/lib/brand";
import { useAuthStore } from "@/store/authStore";
import { useHaptic } from "@/hooks/useHaptic";

const STORAGE_KEY = "belok-walkthrough-v1";

const slides = [
  {
    icon: Sparkles,
    title: `Привет! Мы — ${brandMark}`,
    text: "Кафе здорового питания. За полминуты покажем, что здесь можно делать.",
  },
  {
    icon: Salad,
    title: "Меню и заказ",
    text: "Выбирайте блюда, настраивайте состав под себя — уберите или добавьте ингредиенты — и оплачивайте онлайн.",
  },
  {
    icon: QrCode,
    title: "Бонусы за каждый заказ",
    text: "Кэшбэк с каждой покупки — и в приложении, и на кассе по вашему QR-коду. Бонусами можно оплачивать заказы.",
  },
  {
    icon: UserRoundPlus,
    title: "Начнём?",
    text: "Создайте аккаунт, чтобы копить бонусы, или просто загляните в меню.",
  },
] as const;

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Private mode etc. — the walkthrough will just show again next time.
  }
}

export default function WelcomeWalkthrough() {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();
  const haptic = useHaptic();

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [slide, setSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) return;
    let seen = false;
    try {
      seen = Boolean(localStorage.getItem(STORAGE_KEY));
    } catch {
      seen = true;
    }
    if (seen) return;
    // Logged-in visitors are not new — never bother them with the intro.
    if (user) {
      markSeen();
      return;
    }
    setOpen(true);
    // Two frames so the fade-in transition actually runs after mount.
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, [isLoading, user]);

  if (!open) return null;

  const isLast = slide === slides.length - 1;

  const close = () => {
    markSeen();
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
    router.push("/auth");
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
            {slides.map(({ icon: Icon, title, text }) => (
              <div key={title} className="w-full shrink-0 py-4 text-center">
                <span className="glass-fx mx-auto mb-5 flex size-16 items-center justify-center rounded-full text-(--lg-text)">
                  <Icon className="size-7" strokeWidth={1.5} />
                </span>
                <h2 className="heading-section mb-2">{title}</h2>
                <p className="mx-auto max-w-[17rem] text-sm leading-relaxed text-(--lg-text-muted)">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4 mt-2 flex items-center justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.title}
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
