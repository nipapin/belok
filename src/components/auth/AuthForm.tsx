'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, User as UserIcon } from 'lucide-react';
import { PinInput, REGEXP_ONLY_DIGITS } from '@/components/base/input/pin-input';
import EmailAutocompleteInput from '@/components/auth/EmailAutocompleteInput';
import { PUSH_PROMPT_AUTH_FLAG } from '@/components/notifications/PushPromptAfterRegister';
import { useAuthStore } from '@/store/authStore';

export type AuthFormMode = 'login' | 'register' | 'forgot';
type Step = 'credentials' | 'code' | 'reset';

function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  ariaLabel,
  minLength,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  ariaLabel: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Lock
        className="pointer-events-none absolute left-4 top-1/2 z-10 size-[18px] -translate-y-1/2 text-(--lg-text)"
        strokeWidth={2}
      />
      <input
        type={visible ? 'text' : 'password'}
        className="input-pill min-h-12 pl-11 pr-12 text-[1.0625rem]"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minLength={minLength}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 z-10 flex size-12 -translate-y-1/2 items-center justify-center rounded-full text-(--lg-text) transition"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff className="size-[18px]" strokeWidth={2} />
        ) : (
          <Eye className="size-[18px]" strokeWidth={2} />
        )}
      </button>
    </div>
  );
}

type AuthFormProps = {
  /** Called after successful login / verify / password reset (user already set in store). */
  onSuccess: () => void;
  initialMode?: AuthFormMode;
  initialEmail?: string;
  /** Compact spacing for modal. */
  compact?: boolean;
};

export default function AuthForm({
  onSuccess,
  initialMode = 'login',
  initialEmail,
  compact = false,
}: AuthFormProps) {
  const { setUser } = useAuthStore();

  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    setMode(initialMode);
    setStep('credentials');
    setCode('');
    setPassword('');
    setPasswordConfirm('');
    setError('');
    setInfo('');
    if (initialEmail) setEmail(initialEmail);
  }, [initialMode, initialEmail]);

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

  function switchMode(next: AuthFormMode) {
    setMode(next);
    setStep('credentials');
    setCode('');
    setPassword('');
    setPasswordConfirm('');
    clearMessages();
  }

  function goToForgot() {
    setMode('forgot');
    setStep('credentials');
    setPassword('');
    setPasswordConfirm('');
    setCode('');
    clearMessages();
  }

function finishSuccess(user: Parameters<typeof setUser>[0]) {
    setUser(user);
    try {
      sessionStorage.setItem(PUSH_PROMPT_AUTH_FLAG, '1');
    } catch {
      /* ignore */
    }
    onSuccess();
  }

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error || 'Не удалось отправить код');
          return;
        }
        setStep('reset');
        setCode('');
        setPassword('');
        setPasswordConfirm('');
        setInfo(data?.message || `Если аккаунт существует, код отправлен на ${email}`);
        startCountdown();
        return;
      }

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
        finishSuccess(data.user);
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
      finishSuccess(data.user);
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event?: React.FormEvent) {
    event?.preventDefault();
    clearMessages();

    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Пароли не совпадают');
      return;
    }
    if (code.length < 6) {
      setError('Введите 6-значный код из письма');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Не удалось сбросить пароль');
        return;
      }
      finishSuccess(data.user);
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
      const endpoint =
        mode === 'forgot' ? '/api/auth/forgot-password' : '/api/auth/resend-code';
      const res = await fetch(endpoint, {
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
      setInfo(
        mode === 'forgot'
          ? data?.message || `Если аккаунт существует, код отправлен на ${email}`
          : `Код отправлен повторно на ${email}`
      );
      startCountdown();
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }

  const emailLooksValid = email.includes('@') && email.includes('.');
  const credentialsValid =
    mode === 'forgot'
      ? emailLooksValid
      : emailLooksValid && password.length >= (mode === 'register' ? 8 : 1);
  const resetValid =
    code.length === 6 && password.length >= 8 && password === passwordConfirm;

  const pad = compact ? 'p-0' : 'p-6 sm:p-8';

  return (
    <div className={`w-full ${pad}`}>
      {step === 'credentials' ? (
        <>
          {mode !== 'forgot' ? (
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
          ) : null}

          <h2 className="mb-1 text-lg font-semibold tracking-tight text-(--lg-text)">
            {mode === 'login'
              ? 'Вход в Belok'
              : mode === 'register'
                ? 'Создание аккаунта'
                : 'Восстановление пароля'}
          </h2>
          <p className="mb-5 text-sm text-(--lg-text) opacity-90">
            {mode === 'login'
              ? 'Введите email и пароль.'
              : mode === 'register'
                ? 'Мы отправим 6-значный код на email — чтобы подтвердить, что почта ваша.'
                : 'Укажите email — пришлём 6-значный код для сброса пароля.'}
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

            {mode !== 'forgot' ? (
              <label className="block">
                <span className="sr-only">Пароль</span>
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  placeholder={
                    mode === 'register' ? 'Пароль (мин. 8 символов)' : 'Пароль'
                  }
                  minLength={mode === 'register' ? 8 : undefined}
                  ariaLabel="Пароль"
                />
              </label>
            ) : null}

            {mode === 'login' ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm font-medium text-(--lg-text-muted) underline-offset-2 transition hover:text-(--lg-text) hover:underline"
                  onClick={goToForgot}
                >
                  Забыли пароль?
                </button>
              </div>
            ) : null}

            {error ? <div className="auth-alert-error">{error}</div> : null}
            {info && !error ? <div className="auth-alert-info">{info}</div> : null}

            <button
              type="submit"
              className="btn-primary mt-1 min-h-12 w-full text-[0.9375rem]"
              disabled={loading || !credentialsValid}
            >
              {loading ? <Loader2 className="size-5 shrink-0 animate-spin" /> : null}
              {mode === 'login'
                ? 'Войти'
                : mode === 'register'
                  ? 'Получить код по email'
                  : 'Отправить код'}
            </button>

            {mode === 'forgot' ? (
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => switchMode('login')}
              >
                Вернуться ко входу
              </button>
            ) : null}
          </form>
        </>
      ) : step === 'reset' ? (
        <>
          <h2 className="mb-1 text-lg font-semibold tracking-tight text-(--lg-text)">
            Новый пароль
          </h2>
          <p className="mb-4 text-sm text-(--lg-text) opacity-90">
            Введите код из письма на{' '}
            <span className="font-medium text-(--lg-text)">{email}</span> и задайте новый
            пароль.
          </p>

          <form onSubmit={handleResetPassword} className="flex flex-col gap-3">
            <div>
              <PinInput
                value={code}
                onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                disabled={loading}
                inputMode="numeric"
                autoComplete="one-time-code"
                containerClassName="w-full"
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

            <label className="block">
              <span className="sr-only">Новый пароль</span>
              <PasswordField
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                placeholder="Новый пароль (мин. 8 символов)"
                minLength={8}
                ariaLabel="Новый пароль"
              />
            </label>

            <label className="block">
              <span className="sr-only">Повторите пароль</span>
              <PasswordField
                value={passwordConfirm}
                onChange={setPasswordConfirm}
                autoComplete="new-password"
                placeholder="Повторите пароль"
                minLength={8}
                ariaLabel="Повторите пароль"
              />
            </label>

            {error ? <div className="auth-alert-error">{error}</div> : null}
            {info && !error ? <div className="auth-alert-info">{info}</div> : null}

            <button
              type="submit"
              className="btn-primary mt-1 min-h-12 w-full text-[0.9375rem]"
              disabled={loading || !resetValid}
            >
              {loading ? <Loader2 className="size-5 shrink-0 animate-spin" /> : null}
              Сохранить пароль
            </button>

            <button
              type="button"
              className="btn-ghost w-full"
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
                setPassword('');
                setPasswordConfirm('');
                clearMessages();
              }}
            >
              Изменить email
            </button>
          </form>
        </>
      ) : (
        <>
          <h2 className="mb-1 text-lg font-semibold tracking-tight text-(--lg-text)">
            Подтвердите email
          </h2>
          <p className="mb-4 text-sm text-(--lg-text) opacity-90">
            Мы отправили 6-значный код на{' '}
            <span className="font-medium text-(--lg-text)">{email}</span>. Введите его —
            это нужно один раз, чтобы убедиться, что почта ваша.
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
  );
}
