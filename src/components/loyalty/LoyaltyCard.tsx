'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Star } from 'lucide-react';
import { brandMark } from '@/lib/brand';
import UserQrModal from './UserQrModal';

interface LoyaltyLevel {
  id: string;
  name: string;
  cashbackPercent: number;
  discountPercent: number;
  minSpent: number;
}

interface CurrentLoyaltyLevel {
  id: string;
  name: string;
  cashbackPercent: number;
  discountPercent: number;
  minSpent?: number;
}

interface LoyaltyCardProps {
  userId: string;
  userName: string | null;
  bonusBalance: number;
  totalSpent: number;
  currentLevel: CurrentLoyaltyLevel | null;
  /** Полный список уровней (для расчёта следующего уровня и прогресса). */
  levels?: LoyaltyLevel[];
}

async function generateQrSvg(value: string): Promise<string> {
  return QRCode.toString(value, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#0a0a0a', light: '#00000000' },
  });
}

export default function LoyaltyCard({
  userId,
  userName,
  bonusBalance,
  totalSpent,
  currentLevel,
  levels,
}: LoyaltyCardProps) {
  const nextLevel = useMemo(() => {
    if (!levels || levels.length === 0) return undefined;
    return (
      levels
        .slice()
        .sort((a, b) => a.minSpent - b.minSpent)
        .find((l) => l.minSpent > totalSpent) ?? null
    );
  }, [levels, totalSpent]);

  const [qrSvg, setQrSvg] = useState<string>('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    generateQrSvg(userId).then((svg) => {
      if (!cancelled) setQrSvg(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const cashback = currentLevel?.cashbackPercent ?? 0;

  const progress = useMemo(() => {
    if (!nextLevel || !nextLevel.minSpent) return 100;
    return Math.min((totalSpent / nextLevel.minSpent) * 100, 100);
  }, [nextLevel, totalSpent]);

  const remainingToNext = nextLevel?.minSpent
    ? Math.max(0, Math.ceil(nextLevel.minSpent - totalSpent))
    : 0;

  const showProgressSection = nextLevel !== undefined;

  return (
    <>
      <div className="loyalty-card mb-4 overflow-hidden rounded-3xl">
        <div className="loyalty-card-glow" aria-hidden />
        <div className="relative flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <p className="loyalty-card-eyebrow flex items-center gap-1.5">
              <Star className="size-3.5 fill-amber-400 text-amber-400" strokeWidth={1.5} />
              Карта лояльности
            </p>
            <p className="loyalty-card-brand mt-1 text-xl font-extrabold tracking-tight">
              <span className="lowercase">{brandMark}</span>
            </p>
          </div>
          <span className="loyalty-card-level-pill">{currentLevel?.name || 'Старт'}</span>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Увеличить QR-код для сканирования"
          className="loyalty-card-qr-button relative mx-auto mt-4 flex size-44 items-center justify-center rounded-2xl bg-white p-3 sm:size-48"
        >
          {qrSvg ? (
            <span
              className="block size-full [&>svg]:size-full"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <span className="size-full animate-pulse rounded-lg bg-zinc-100" aria-hidden />
          )}
        </button>

        <p className="loyalty-card-hint mt-3 px-5 text-center text-xs sm:px-6">
          Покажите QR-код кассиру для начисления бонусов
        </p>

        <div className="loyalty-card-stats mx-5 mt-4 grid grid-cols-2 gap-2 rounded-2xl px-3 py-3 sm:mx-6">
          <div className="text-center">
            <p className="loyalty-card-stat-label">Баланс</p>
            <p className="loyalty-card-stat-value">{Math.floor(bonusBalance)}</p>
          </div>
          <div className="text-center">
            <p className="loyalty-card-stat-label">Кэшбэк</p>
            <p className="loyalty-card-stat-value">{cashback}%</p>
          </div>
        </div>

        {showProgressSection ? (
          nextLevel ? (
            <div className="px-5 pt-4 pb-5 sm:px-6 sm:pb-6">
              <div className="mb-2 flex justify-between text-[11px] font-medium">
                <span className="loyalty-card-progress-label">
                  До «{nextLevel.name}»
                </span>
                <span className="loyalty-card-progress-value">{remainingToNext} ₽</span>
              </div>
              <div className="loyalty-card-progress-track">
                <div
                  className="loyalty-card-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="px-5 pt-2 pb-5 sm:px-6 sm:pb-6">
              <p className="loyalty-card-progress-label text-center text-[11px]">
                Высший уровень программы
              </p>
            </div>
          )
        ) : (
          <div className="pb-5 sm:pb-6" aria-hidden />
        )}
      </div>

      <UserQrModal
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        userName={userName || 'Гость'}
      />
    </>
  );
}
