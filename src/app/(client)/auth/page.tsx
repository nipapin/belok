'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Lock, Mail, User as UserIcon } from 'lucide-react';
import { PinInput, REGEXP_ONLY_DIGITS } from '@/components/base/input/pin-input';
import EmailAutocompleteInput from '@/components/auth/EmailAutocompleteInput';
import { useAuthStore } from '@/store/authStore';

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-(--lg-text-muted)">Загрузка…</div>}>
      <AuthPageInner />
    </Suspense>
  );
}

type Mode = 'login' | 'register';
type Step = 'credentials' | 'code';

function AuthPageInner() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { setUser } = useAuthStore();

  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const startCountdown = () => setResendCountdown(60);

  function clearMessages() {
    setError('');
    setInfo('');
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep('credentials');
    setCode('');
    clearMessages();
  }

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));

        if (data?.requiresVerification) {
          setStep('code');
          setCode('');
          setInfo(
            data?.error
              ? `${data.error}`
              : `Email не подтверждён. Мы отправили код на ${email}.`
          );
          startCountdown();
          return;
        }
        if (!res.ok) {
          setError(data?.error || 'Не удалось войти');
          return;
        }
        setUser(data.user);
        window.location.href = redirect;
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error || 'Не удалось зарегистрироваться');
          return;
        }
        setStep('code');
        setCode('');
        setInfo(`Код подтверждения отправлен на ${email}`);
        startCountdown();
      }
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(codeOverride?: string) {
    const submission = codeOverride ?? code;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: submission }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Неверный код');
        return;
      }
      setUser(data.user);
      // Mark that the user just completed registration so the post-auth
      // PushPrompt can decide whether to show itself.
      try {
        sessionStorage.setItem('belok_just_registered', '1');
      } catch {
        /* private mode etc. — ignore */
      }
      window.location.href = redirect;
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCountdown > 0) return;
    clearMessages();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Не удалось отправить код повторно');
        return;
      }
      setInfo(`Код отправлен повторно на ${email}`);
      startCountdown();
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }

  const credentialsValid =
    email.includes('@') &&
    email.includes('.') &&
    password.length >= (mode === 'register' ? 8 : 1);

  return (
    <div className="mx-auto flex min-h-[min(100%,calc(100dvh-5.5rem))] max-w-md flex-col items-center justify-center px-2 pb-10 pt-8 sm:pt-12">
      <div className="glass-panel-strong w-full p-6 sm:p-8">
        {step === 'credentials' ? (
          <>
            <div className="mb-5 flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)] p-1">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={
                  'flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors ' +
                  (mode === 'login'
                    ? 'bg-(--lg-fill) text-(--lg-text) shadow-sm'
                    : 'text-(--lg-text-muted) hover:text-(--lg-text)')
                }
              >
                Вход
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={
                  'flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors ' +
                  (mode === 'register'
                    ? 'bg-(--lg-fill) text-(--lg-text) shadow-sm'
                    : 'text-(--lg-text-muted) hover:text-(--lg-text)')
                }
              >
                Регистрация
              </button>
            </div>

            <h2 className="mb-1 text-lg font-semibold tracking-tight text-(--lg-text)">
              {mode === 'login' ? 'Вход в Belok' : 'Создание аккаунта'}
            </h2>
            <p className="mb-5 text-sm text-(--lg-text-muted)">
              {mode === 'login'
                ? 'Введите email и пароль.'
                : 'Мы отправим 6-значный код на email — чтобы подтвердить, что почта ваша.'}
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === 'register' ? (
                <label className="block">
                  <span className="sr-only">Имя</span>
                  <div className="relative">
                    <UserIcon
                      className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-(--lg-text-muted) opacity-80"
                      strokeWidth={1.75}
                    />
                    <input
                      className="input-pill min-h-12 pl-11 text-[1.0625rem]"
                      placeholder="Имя (необязательно)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                </label>
              ) : null}

              <label className="block">
                <span className="sr-only">Электронная почта</span>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-4 top-1/2 z-10 size-[18px] -translate-y-1/2 text-(--lg-text-muted) opacity-80"
                    strokeWidth={1.75}
                  />
                  <EmailAutocompleteInput
                    className="input-pill min-h-12 pl-11 text-[1.0625rem]"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    aria-label="Электронная почта"
                  />
                </div>
              </label>

              <label className="block">
                <span className="sr-only">Пароль</span>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-(--lg-text-muted) opacity-80"
                    strokeWidth={1.75}
                  />
                  <input
                    type="password"
                    className="input-pill min-h-12 pl-11 text-[1.0625rem]"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    placeholder={
                      mode === 'register' ? 'Пароль (мин. 8 символов)' : 'Пароль'
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={mode === 'register' ? 8 : undefined}
                    aria-label="Пароль"
                  />
                </div>
              </label>

              {error ? <div className="auth-alert-error">{error}</div> : null}
              {info && !error ? <div className="auth-alert-info">{info}</div> : null}

              <button
                type="submit"
                className="btn-primary mt-1 min-h-12 w-full text-[0.9375rem]"
                disabled={loading || !credentialsValid}
              >
                {loading ? <Loader2 className="size-5 shrink-0 animate-spin" /> : null}
                {mode === 'login' ? 'Войти' : 'Получить код по email'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-lg font-semibold tracking-tight text-(--lg-text)">
              Подтвердите email
            </h2>
            <p className="mb-4 text-sm text-(--lg-text-muted)">
              Мы отправили 6-значный код на <span className="font-medium text-(--lg-text)">{email}</span>.
              Введите его — это нужно один раз, чтобы убедиться, что почта ваша.
            </p>

            <div className="mb-4">
              <PinInput
                value={code}
                onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                disabled={loading}
                inputMode="numeric"
                autoComplete="one-time-code"
                containerClassName="w-full"
                onComplete={(full) => {
                  void handleVerify(full);
                }}
                aria-label="Код из письма"
              >
                <PinInput.Label className="sr-only">Код из письма</PinInput.Label>
                <PinInput.Group>
                  <PinInput.Slot index={0} />
                  <PinInput.Slot index={1} />
                  <PinInput.Slot index={2} />
                  <PinInput.Slot index={3} />
                  <PinInput.Slot index={4} />
                  <PinInput.Slot index={5} />
                </PinInput.Group>
                <PinInput.Description>Введите 6 цифр из письма</PinInput.Description>
              </PinInput>
            </div>

            {error ? <div className="auth-alert-error mb-3">{error}</div> : null}
            {info && !error ? <div className="auth-alert-info mb-3">{info}</div> : null}

            <button
              type="button"
              className="btn-primary mb-3 min-h-12 w-full text-[0.9375rem]"
              onClick={() => void handleVerify()}
              disabled={loading || code.length < 6}
            >
              {loading ? <Loader2 className="size-5 shrink-0 animate-spin" /> : null}
              Подтвердить
            </button>
            <button
              type="button"
              className="btn-ghost mb-2 w-full"
              onClick={() => void handleResend()}
              disabled={resendCountdown > 0 || loading}
            >
              {resendCountdown > 0
                ? `Отправить повторно через ${resendCountdown} с`
                : 'Отправить код повторно'}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setStep('credentials');
                setCode('');
                clearMessages();
              }}
            >
              Изменить email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
