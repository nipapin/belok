'use client';

import { useCallback, useState } from 'react';
import { Camera, CheckCircle2, Keyboard, Loader2, RotateCcw, Star, UserCircle2 } from 'lucide-react';
import Image from 'next/image';
import QrScanner from '@/components/loyalty/QrScanner';

interface LoyaltyLevel {
  id: string;
  name: string;
  cashbackPercent: number;
  discountPercent: number;
  minSpent: number;
}

interface LoyaltyUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  bonusBalance: number;
  totalSpent: number;
  loyaltyLevel: LoyaltyLevel | null;
}

interface AwardResult {
  bonusEarned: number;
  cashbackPercent: number;
  amount: number;
  user: LoyaltyUser;
}

type Mode = 'scan' | 'manual';
type Stage = 'lookup' | 'form' | 'success';

export default function AdminLoyaltyPage() {
  const [mode, setMode] = useState<Mode>('scan');
  const [stage, setStage] = useState<Stage>('lookup');
  const [manualId, setManualId] = useState('');
  const [user, setUser] = useState<LoyaltyUser | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AwardResult | null>(null);

  const lookupUser = useCallback(async (rawId: string) => {
    const id = rawId.trim();
    if (!id) {
      setError('Пустой идентификатор');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/loyalty/lookup/${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Не удалось найти клиента');
        return;
      }
      setUser(data.user as LoyaltyUser);
      setAmount('');
      setStage('form');
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScan = useCallback(
    (value: string) => {
      if (loading || stage !== 'lookup') return;
      lookupUser(value);
    },
    [loading, stage, lookupUser]
  );

  const handleAward = async () => {
    if (!user) return;
    const amt = Math.round(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Введите сумму заказа');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/loyalty/award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amount: amt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Не удалось начислить');
        return;
      }
      setResult(data as AwardResult);
      setStage('success');
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStage('lookup');
    setUser(null);
    setManualId('');
    setAmount('');
    setError('');
    setResult(null);
  };

  const cashback = user?.loyaltyLevel?.cashbackPercent ?? 3;
  const previewBonus = (() => {
    const amt = Math.round(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) return 0;
    return Math.round(amt * (cashback / 100));
  })();

  return (
    <div className="mx-auto max-w-md">
      <h1 className="heading-section mb-2">Касса · Лояльность</h1>
      <p className="mb-6 text-sm text-(--lg-text-muted)">
        Отсканируйте QR-код клиента и начислите бонусы за сумму заказа.
      </p>

      {stage === 'lookup' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('scan');
                setError('');
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                mode === 'scan'
                  ? 'border-(--lg-ring-strong) bg-[#18181b] text-white'
                  : 'border-(--lg-ring) text-(--lg-text)'
              }`}
            >
              <Camera className="size-4" strokeWidth={1.75} />
              Сканер
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('manual');
                setError('');
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                mode === 'manual'
                  ? 'border-(--lg-ring-strong) bg-[#18181b] text-white'
                  : 'border-(--lg-ring) text-(--lg-text)'
              }`}
            >
              <Keyboard className="size-4" strokeWidth={1.75} />
              Ввести ID
            </button>
          </div>

          {mode === 'scan' ? (
            <div className="space-y-3">
              <QrScanner onScan={handleScan} paused={loading} />
              {loading && (
                <p className="flex items-center justify-center gap-2 text-sm text-(--lg-text-muted)">
                  <Loader2 className="size-4 animate-spin" />
                  Загружаем данные клиента…
                </p>
              )}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                lookupUser(manualId);
              }}
              className="space-y-3"
            >
              <label className="block text-sm font-medium text-(--lg-text)">
                Идентификатор клиента
                <input
                  className="input-pill mt-1.5 font-mono text-sm"
                  type="text"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="Вставьте UUID из QR-кода"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <button
                type="submit"
                className="btn-primary w-full py-3 disabled:opacity-50"
                disabled={loading || !manualId.trim()}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : 'Найти'}
              </button>
            </form>
          )}

          {error && <p className="auth-alert-error">{error}</p>}
        </div>
      )}

      {stage === 'form' && user && (
        <div className="space-y-5">
          <div className="glass-panel p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-(--lg-ring) bg-(--lg-fill)">
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="size-full object-cover"
                    unoptimized
                  />
                ) : (
                  <UserCircle2 className="size-9 text-(--lg-text-muted)" strokeWidth={1.25} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-(--lg-text)">
                  {user.name || 'Без имени'}
                </p>
                <p className="truncate text-xs text-(--lg-text-muted)">
                  {user.email || user.phone || '—'}
                </p>
              </div>
              <span className="admin-chip-neutral inline-flex items-center gap-1 text-xs font-semibold">
                <Star className="size-3 fill-amber-400 text-amber-500" strokeWidth={1.5} />
                {user.loyaltyLevel?.name || 'Старт'}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] pt-3 text-xs">
              <div>
                <dt className="text-(--lg-text-muted)">Баланс бонусов</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-(--lg-text)">
                  {Math.floor(user.bonusBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-(--lg-text-muted)">Кэшбэк</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-(--lg-text)">{cashback}%</dd>
              </div>
            </dl>
          </div>

          <div className="glass-panel p-5">
            <label className="block text-sm font-medium text-(--lg-text)">
              Сумма заказа, ₽
              <input
                className="input-pill mt-1.5 text-base"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </label>
            <div className="mt-3 flex items-baseline justify-between text-sm">
              <span className="text-(--lg-text-muted)">К начислению</span>
              <span className="font-semibold tabular-nums text-(--lg-text)">
                +{previewBonus} бонусов
              </span>
            </div>
            <button
              type="button"
              onClick={handleAward}
              className="btn-primary mt-4 w-full py-3 disabled:opacity-50"
              disabled={loading || previewBonus <= 0}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>Начислить +{previewBonus}</>
              )}
            </button>
          </div>

          {error && <p className="auth-alert-error">{error}</p>}

          <button
            type="button"
            onClick={reset}
            className="btn-ghost w-full py-2.5"
          >
            Отмена
          </button>
        </div>
      )}

      {stage === 'success' && result && (
        <div className="space-y-4">
          <div className="glass-panel p-6 text-center">
            <CheckCircle2 className="mx-auto size-12 text-emerald-500" strokeWidth={1.5} />
            <p className="mt-3 text-base font-semibold text-(--lg-text)">Бонусы начислены</p>
            <p className="mt-1 text-sm text-(--lg-text-muted)">
              {result.user.name || 'Клиент'} · сумма заказа {result.amount} ₽
            </p>
            <p className="mt-4 text-3xl font-bold tabular-nums text-(--lg-text)">
              +{result.bonusEarned}
            </p>
            <p className="mt-1 text-xs text-(--lg-text-muted)">
              Кэшбэк {result.cashbackPercent}% · новый баланс{' '}
              <span className="font-semibold tabular-nums text-(--lg-text)">
                {Math.floor(result.user.bonusBalance)}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            className="btn-primary w-full py-3"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} />
            Сканировать следующего
          </button>
        </div>
      )}
    </div>
  );
}
