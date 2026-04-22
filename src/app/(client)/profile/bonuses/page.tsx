'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface BonusTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

export default function BonusesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['bonuses'],
    queryFn: () => fetch('/api/bonuses').then((r) => r.json()),
  });

  const transactions: BonusTransaction[] = data?.transactions ?? [];
  const balance: number = data?.balance ?? 0;

  return (
    <div className="mx-auto max-w-md pb-4 pt-2 px-2">
      <h1 className="heading-section mb-4">Детализация бонусов</h1>

      <div className="glass-panel-strong mb-6 rounded-3xl bg-zinc-900 p-6 text-center text-white shadow-xl">
        <p className="mb-1 text-sm font-medium text-white/65">Баланс</p>
        <p className="text-3xl font-bold tracking-tight">{Math.floor(balance)} бонусов</p>
      </div>

      <h2 className="mb-3 text-base font-semibold text-zinc-900">История операций</h2>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-tight h-[72px] animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">Пока нет операций</p>
      ) : (
        transactions.map((tx) => (
          <div
            key={tx.id}
            className="glass-panel mb-2 flex items-center justify-between gap-3 p-3 sm:p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              {tx.amount > 0 ? (
                <ArrowUp className="size-4 shrink-0 text-emerald-600" strokeWidth={2} />
              ) : (
                <ArrowDown className="size-4 shrink-0 text-rose-600" strokeWidth={2} />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {tx.description || tx.type}
                </p>
                <p className="text-xs text-zinc-500">
                  {new Date(tx.createdAt).toLocaleString('ru-RU')}
                </p>
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${
                tx.amount > 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {tx.amount > 0 ? '+' : ''}
              {tx.amount}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
