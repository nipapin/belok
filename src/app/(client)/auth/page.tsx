"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Phone } from "lucide-react";
import { PinInput, REGEXP_ONLY_DIGITS } from "@/components/base/input/pin-input";
import { useAuthStore } from "@/store/authStore";

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-(--lg-text-muted)">Загрузка…</div>}>
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageInner() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const { setUser } = useAuthStore();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("+7");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [devCode, setDevCode] = useState("");

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      if (data.code) setDevCode(data.code);
      setStep("code");
      setCountdown(60);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (codeOverride?: string) => {
    const codeToSend = codeOverride ?? code;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: codeToSend }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setUser(data.user);
      window.location.href = redirect;
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 1) return "+7";
    return "+7" + digits.slice(1, 11);
  };

  return (
    <div className="mx-auto flex min-h-[min(100%,calc(100dvh-5.5rem))] max-w-md flex-col items-center justify-center px-4 pb-10 pt-8 sm:pt-12">
      <div className="glass-panel-strong p-6 sm:p-8">
        {step === "phone" ? (
          <>
            <h2 className="mb-5 text-lg font-semibold tracking-tight text-(--lg-text)">Вход по номеру телефона</h2>
            <div className="relative mb-4">
              <Phone
                className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-(--lg-text-muted) opacity-80"
                strokeWidth={1.75}
              />
              <input
                className="input-pill min-h-12 pl-11 text-[1.0625rem] tabular-nums"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7…"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                aria-label="Номер телефона"
              />
            </div>
            {error && <div className="auth-alert-error mb-4">{error}</div>}
            <button
              type="button"
              className="btn-primary min-h-12 w-full text-[0.9375rem]"
              onClick={handleSendCode}
              disabled={loading || phone.length < 12}
            >
              {loading ? <Loader2 className="size-5 shrink-0 animate-spin" /> : null}
              Получить код
            </button>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-lg font-semibold tracking-tight text-(--lg-text)">Введите код</h2>
            <p className="mb-4 text-sm text-(--lg-text-muted)">Код отправлен на {phone}</p>
            {devCode && <div className="auth-alert-info mb-4">Для разработки: код — {devCode}</div>}
            <div className="mb-4">
              <PinInput
                value={code}
                onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                pattern={REGEXP_ONLY_DIGITS}
                disabled={loading}
                inputMode="numeric"
                autoComplete="one-time-code"
                containerClassName="w-full"
                onComplete={(full) => {
                  void handleVerifyCode(full);
                }}
                aria-label="Код из SMS"
              >
                <PinInput.Label className="sr-only">Код из SMS</PinInput.Label>
                <PinInput.Group>
                  <PinInput.Slot index={0} />
                  <PinInput.Slot index={1} />
                  <PinInput.Slot index={2} />
                  <PinInput.Slot index={3} />
                </PinInput.Group>
                <PinInput.Description>Введите 4 цифры из SMS</PinInput.Description>
              </PinInput>
            </div>
            {error && <div className="auth-alert-error mb-4">{error}</div>}
            <button
              type="button"
              className="btn-primary mb-3 min-h-12 w-full text-[0.9375rem]"
              onClick={() => void handleVerifyCode()}
              disabled={loading || code.length < 4}
            >
              {loading ? <Loader2 className="size-5 shrink-0 animate-spin" /> : null}
              Подтвердить
            </button>
            <button
              type="button"
              className="btn-ghost mb-2 w-full"
              onClick={() => {
                if (countdown === 0) {
                  handleSendCode();
                }
              }}
              disabled={countdown > 0}
            >
              {countdown > 0 ? `Повторно через ${countdown} с` : "Отправить код повторно"}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError("");
              }}
            >
              Изменить номер
            </button>
          </>
        )}
      </div>
    </div>
  );
}
