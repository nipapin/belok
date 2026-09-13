'use client';

import { Delete, Loader2 } from 'lucide-react';
import { useState } from 'react';

type KioskPinPadProps = {
  configured: boolean;
  onUnlocked: () => void;
};

export default function KioskPinPad({ configured, onUnlocked }: KioskPinPadProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(nextPin: string) {
    if (nextPin.length < 4 || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/kiosk/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: nextPin }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || 'Неверный PIN');
        setPin('');
        return;
      }
      onUnlocked();
    } catch {
      setError('Нет соединения');
    } finally {
      setLoading(false);
    }
  }

  function pushDigit(digit: string) {
    if (loading) return;
    setError('');
    setPin((current) => {
      if (current.length >= 6) return current;
      return current + digit;
    });
  }

  function backspace() {
    if (loading) return;
    setError('');
    setPin((current) => current.slice(0, -1));
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

  if (!configured) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
        <h1 className="text-3xl font-semibold text-(--lg-text)">Терминал не настроен</h1>
        <p className="mt-3 max-w-md text-base text-(--lg-text-muted)">
          Задайте PIN в админке: Настройки → Терминал у кассы.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
      <h1 className="text-3xl font-semibold text-(--lg-text)">Терминал</h1>
      <p className="mt-2 text-base text-(--lg-text-muted)">Введите PIN, чтобы открыть меню</p>

      <div className="mt-8 flex gap-3" aria-hidden>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={`size-4 rounded-full ${
              i < pin.length ? 'bg-(--lg-text)' : 'bg-[color-mix(in_srgb,var(--lg-text)_25%,transparent)]'
            }`}
          />
        ))}
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-red-200">{error}</p> : null}

      <div className="mt-8 grid w-full max-w-[320px] grid-cols-3 gap-3">
        {keys.map((digit) => (
          <button
            key={digit}
            type="button"
            className="glass-panel h-16 touch-manipulation text-2xl font-semibold text-(--lg-text)"
            onClick={() => pushDigit(digit)}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          className="glass-panel flex h-16 touch-manipulation items-center justify-center text-(--lg-text)"
          onClick={backspace}
          aria-label="Стереть"
        >
          <Delete className="size-6" />
        </button>
        <button
          type="button"
          className="glass-panel h-16 touch-manipulation text-2xl font-semibold text-(--lg-text)"
          onClick={() => pushDigit('0')}
        >
          0
        </button>
        <button
          type="button"
          className="btn-primary h-16 touch-manipulation text-lg font-semibold"
          disabled={pin.length < 4 || loading}
          onClick={() => void submit(pin)}
        >
          {loading ? <Loader2 className="size-6 animate-spin" /> : 'OK'}
        </button>
      </div>
    </div>
  );
}
