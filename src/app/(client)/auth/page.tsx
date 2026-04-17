'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Lock, Phone } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { brandMark } from '@/lib/brand';

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-500">Загрузка…</div>}>
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageInner() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { setUser } = useAuthStore();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+7');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [devCode, setDevCode] = useState('');

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      if (data.code) setDevCode(data.code);
      setStep('code');
      setCountdown(60);
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setUser(data.user);
      window.location.href = redirect;
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 1) return '+7';
    return '+7' + digits.slice(1, 11);
  };

  return (
    <div className="mx-auto max-w-md px-2 pb-8 pt-12">
      <div className="mb-8 text-center">
        <h1 className="heading-display lowercase text-zinc-900">{brandMark}</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">кафе здорового питания</p>
      </div>

      <div className="glass-panel-strong p-6 sm:p-8">
        {step === 'phone' ? (
          <>
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Вход по номеру телефона</h2>
            <div className="relative mb-4">
              <Phone className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-zinc-400" />
              <input
                className="input-pill pl-11"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7…"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                aria-label="Номер телефона"
              />
            </div>
            {error && (
              <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
            )}
            <button
              type="button"
              className="btn-primary w-full"
              onClick={handleSendCode}
              disabled={loading || phone.length < 12}
            >
              {loading ? <Loader2 className="size-5 animate-spin" /> : null}
              Получить код
            </button>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Введите код</h2>
            <p className="mb-4 text-sm text-zinc-500">Код отправлен на {phone}</p>
            {devCode && (
              <div className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-950">
                Для разработки: код — {devCode}
              </div>
            )}
            <div className="relative mb-4">
              <Lock className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-zinc-400" />
              <input
                className="input-pill pl-11 tracking-widest"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                aria-label="Код из SMS"
              />
            </div>
            {error && (
              <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
            )}
            <button
              type="button"
              className="btn-primary mb-3 w-full"
              onClick={handleVerifyCode}
              disabled={loading || code.length < 4}
            >
              {loading ? <Loader2 className="size-5 animate-spin" /> : null}
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
              {countdown > 0 ? `Повторно через ${countdown} с` : 'Отправить код повторно'}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError('');
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
