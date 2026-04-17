'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  Gift,
  Loader2,
  LogOut,
  Receipt,
  Star,
  UserCircle2,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useQuery } from '@tanstack/react-query';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading, setUser, logout } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = '/auth?redirect=/profile';
    }
  }, [isLoading, user]);

  const { data: bonusData } = useQuery({
    queryKey: ['bonuses'],
    queryFn: () => fetch('/api/bonuses').then((r) => r.json()),
    enabled: !!user,
  });

  const levels = bonusData?.levels ?? [];
  const currentLevel = bonusData?.currentLevel;
  const nextLevel = levels.find(
    (l: { minSpent: number }) => l.minSpent > (user?.totalSpent || 0)
  );

  const progress = nextLevel ? Math.min(((user?.totalSpent || 0) / nextLevel.minSpent) * 100, 100) : 100;

  const handleSave = async () => {
    const res = await fetch('/api/auth/update-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pb-4 pt-2">
      {saved && (
        <div className="mb-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900 backdrop-blur-sm">
          Профиль обновлён
        </div>
      )}

      <div className="glass-panel mb-4 p-5">
        <div className="mb-4 flex items-center gap-3">
          <UserCircle2 className="size-14 shrink-0 text-zinc-400" strokeWidth={1.25} />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-900">{user.name || 'Гость'}</h2>
            <p className="text-sm text-zinc-500">{user.phone}</p>
          </div>
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            <label className="block text-sm font-medium text-zinc-700">
              Имя
              <input
                className="input-pill mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-zinc-700">
              Электронная почта
              <input
                className="input-pill mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={handleSave}>
                Сохранить
              </button>
              <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-outline py-2 text-sm"
            onClick={() => {
              setName(user.name || '');
              setEmail(user.email || '');
              setEditing(true);
            }}
          >
            Редактировать
          </button>
        )}
      </div>

      <div className="glass-panel mb-4 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Star className="size-5 fill-amber-400 text-amber-500" strokeWidth={1.5} />
          <h2 className="text-base font-semibold text-zinc-900">Программа лояльности</h2>
        </div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
            {currentLevel?.name || 'Стартовый уровень'}
          </span>
          {nextLevel && (
            <span className="text-xs text-zinc-500">
              До «{nextLevel.name}»: {Math.ceil(nextLevel.minSpent - (user.totalSpent || 0))} ₽
            </span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-200/80">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex justify-between text-sm text-zinc-600">
          <span>Кэшбэк: {currentLevel?.cashbackPercent ?? 0}%</span>
          <span>Скидка: {currentLevel?.discountPercent ?? 0}%</span>
        </div>
      </div>

      <div className="glass-panel-strong mb-4 border-emerald-200/30 bg-gradient-to-br from-white/70 via-emerald-50/40 to-white/60 p-5">
        <div className="mb-1 flex items-center gap-2 text-emerald-900">
          <Gift className="size-5" strokeWidth={1.75} />
          <h2 className="text-base font-semibold">Бонусный баланс</h2>
        </div>
        <p className="text-3xl font-bold tracking-tight text-emerald-950">
          {Math.floor(user.bonusBalance)}{' '}
          <span className="text-base font-normal text-zinc-600">бонусов</span>
        </p>
        <p className="mt-2 text-sm text-zinc-600">1 бонус = 1 ₽ · до 30% суммы заказа</p>
      </div>

      <hr className="my-6 border-zinc-900/10" />

      {[
        { label: 'История заказов', icon: Receipt, path: '/orders' },
        { label: 'Детализация бонусов', icon: Gift, path: '/profile/bonuses' },
        { label: 'Карта в Wallet', icon: CreditCard, path: '/profile/wallet' },
      ].map((item) => (
        <button
          key={item.path}
          type="button"
          onClick={() => router.push(item.path)}
          className="glass-panel mb-2 flex w-full cursor-pointer items-center gap-3 p-4 text-left transition hover:bg-white/55"
        >
          <item.icon className="size-5 shrink-0 text-zinc-600" strokeWidth={1.75} />
          <span className="font-medium text-zinc-900">{item.label}</span>
        </button>
      ))}

      <button
        type="button"
        className="btn-outline mt-6 w-full border-rose-200/80 text-rose-700 hover:bg-rose-50/80"
        onClick={handleLogout}
      >
        <LogOut className="size-4" />
        Выйти
      </button>
    </div>
  );
}
