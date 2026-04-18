'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AppleWalletMark, GoogleWalletMark } from '@/components/icons/WalletProviderIcons';
import { useAuthStore } from '@/store/authStore';
import { brandMark } from '@/lib/brand';

export default function WalletPage() {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState('');

  const handleAppleWallet = async () => {
    setLoading('apple');
    setError('');
    try {
      const res = await fetch('/api/wallet/apple');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      window.alert(
        'Для полноценной работы Apple Wallet нужны сертификаты Apple Developer. Структура карты подготовлена.'
      );
    } catch {
      setError('Не удалось получить карту');
    } finally {
      setLoading(null);
    }
  };

  const handleGoogleWallet = async () => {
    setLoading('google');
    setError('');
    try {
      const res = await fetch('/api/wallet/google');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      window.open(data.link, '_blank');
    } catch {
      setError('Не удалось получить ссылку');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mx-auto max-w-md pb-4 pt-2 px-4">
      <h1 className="heading-section mb-4">Карта в Wallet</h1>

      <div className="glass-panel-strong relative mb-6 overflow-hidden rounded-3xl bg-zinc-900 p-6 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-white/5" />
        <p className="relative mb-6 text-2xl font-extrabold tracking-[0.15em]">{brandMark}</p>
        <div className="relative mb-4 flex justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Бонусы</p>
            <p className="text-2xl font-bold tabular-nums">{Math.floor(user?.bonusBalance || 0)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Уровень</p>
            <p className="text-2xl font-bold">{user?.loyaltyLevel?.name || 'Старт'}</p>
          </div>
        </div>
        <p className="relative text-sm text-white/55">
          {user?.name || 'Гость'} · {user?.phone}
        </p>
      </div>

      <p className="mb-4 text-center text-sm text-white/55">
        Добавьте карту лояльности в кошелёк телефона для быстрого доступа к бонусам
      </p>

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="btn-primary w-full bg-zinc-950 py-3.5 hover:bg-zinc-900"
          onClick={handleAppleWallet}
          disabled={loading !== null}
        >
          {loading === 'apple' ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <AppleWalletMark className="size-5 shrink-0 text-white" />
          )}
          Добавить в Apple Wallet
        </button>

        <button
          type="button"
          className="btn-primary w-full bg-[#4285F4] py-3.5 hover:bg-[#3367d6]"
          onClick={handleGoogleWallet}
          disabled={loading !== null}
        >
          {loading === 'google' ? (
            <Loader2 className="size-5 animate-spin text-white" />
          ) : (
            <GoogleWalletMark className="size-5 shrink-0 text-white" />
          )}
          Добавить в Google Wallet
        </button>
      </div>
    </div>
  );
}
