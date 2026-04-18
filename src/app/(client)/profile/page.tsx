'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  Gift,
  LayoutDashboard,
  Loader2,
  LogOut,
  Receipt,
  Star,
  UserCircle2,
  X,
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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!avatarModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAvatarModalOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [avatarModalOpen]);

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

  const handleAvatarPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError('');
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/auth/avatar', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAvatarError(typeof data.error === 'string' ? data.error : 'Не удалось загрузить фото');
        return;
      }
      setUser(data.user);
    } catch {
      setAvatarError('Ошибка соединения');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarError('');
    setAvatarBusy(true);
    try {
      const res = await fetch('/api/auth/avatar', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAvatarError(typeof data.error === 'string' ? data.error : 'Не удалось удалить фото');
        return;
      }
      setUser(data.user);
    } catch {
      setAvatarError('Ошибка соединения');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleReplacePhoto = () => {
    setAvatarModalOpen(false);
    requestAnimationFrame(() => avatarFileInputRef.current?.click());
  };

  const avatarTriggerClass =
    'relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-(--lg-ring) bg-(--lg-fill) backdrop-blur-sm transition hover:border-(--lg-ring-strong)';

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-8 animate-spin text-(--lg-text-muted)" />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-md px-4 pb-6 pt-4">
      {saved && <div className="profile-alert-success mb-4">Профиль обновлён</div>}
      {avatarError && <div className="auth-alert-error mb-4">{avatarError}</div>}

      <input
        ref={avatarFileInputRef}
        id="profile-avatar-file"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleAvatarPick}
        disabled={avatarBusy}
        aria-hidden
        tabIndex={-1}
      />

      <div className="glass-panel mb-4 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="shrink-0">
            {avatarBusy ? (
              <div
                className={`${avatarTriggerClass} cursor-wait`}
                aria-busy
              >
                <Loader2 className="size-7 animate-spin text-(--lg-text-muted)" />
              </div>
            ) : user.avatarUrl ? (
              <button
                type="button"
                className={`${avatarTriggerClass} cursor-pointer`}
                onClick={() => setAvatarModalOpen(true)}
                aria-label="Изменить фото профиля"
                aria-haspopup="dialog"
              >
                <Image
                  src={user.avatarUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="size-full object-cover"
                  unoptimized
                />
              </button>
            ) : (
              <label
                htmlFor="profile-avatar-file"
                className={`${avatarTriggerClass} cursor-pointer`}
                aria-label="Загрузить фото профиля"
              >
                <UserCircle2 className="size-13 text-(--lg-text-muted)" strokeWidth={1.25} />
              </label>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-(--lg-text)">
              {user.name || 'Гость'}
            </h2>
            <p className="text-sm text-(--lg-text-muted)">{user.phone}</p>
          </div>
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            <label className="block text-sm font-medium text-(--lg-text)">
              Имя
              <input
                className="input-pill mt-1.5 min-h-11"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-(--lg-text)">
              Электронная почта
              <input
                className="input-pill mt-1.5 min-h-11"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn-primary px-5 py-2.5 text-sm" onClick={handleSave}>
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
            className="btn-outline py-2.5 text-sm"
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

      <div className="glass-panel mb-4 p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <Star className="size-5 shrink-0 fill-amber-400 text-amber-500" strokeWidth={1.5} />
          <h2 className="text-base font-semibold tracking-tight text-(--lg-text)">
            Программа лояльности
          </h2>
        </div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="profile-level-pill">{currentLevel?.name || 'Стартовый уровень'}</span>
          {nextLevel && (
            <span className="text-xs text-(--lg-text-muted)">
              До «{nextLevel.name}»: {Math.ceil(nextLevel.minSpent - (user.totalSpent || 0))} ₽
            </span>
          )}
        </div>
        <div className="profile-progress-track">
          <div className="profile-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-sm text-(--lg-text-muted)">
          <span>Кэшбэк: {currentLevel?.cashbackPercent ?? 0}%</span>
          <span>Скидка: {currentLevel?.discountPercent ?? 0}%</span>
        </div>
      </div>

      <div className="glass-panel-strong profile-bonus-card mb-4 p-5 sm:p-6">
        <div className="mb-1 flex items-center gap-2">
          <Gift className="profile-bonus-icon size-5 shrink-0" strokeWidth={1.75} />
          <h2 className="profile-bonus-heading text-base font-semibold">Бонусный баланс</h2>
        </div>
        <p className="profile-bonus-amount text-3xl font-bold tracking-tight">
          {Math.floor(user.bonusBalance)}{' '}
          <span className="profile-bonus-muted text-base font-normal">бонусов</span>
        </p>
        <p className="profile-bonus-muted mt-2 text-sm">1 бонус = 1 ₽ · до 30% суммы заказа</p>
      </div>

      <hr className="profile-divider" />

      {user.role === 'ADMIN' && (
        <button
          type="button"
          onClick={() => router.push('/admin')}
          className="glass-panel-strong lg-interactive mb-2 flex w-full cursor-pointer items-center gap-3 border border-(--lg-ring) p-4 text-left"
        >
          <LayoutDashboard className="size-5 shrink-0 text-(--lg-text)" strokeWidth={1.75} />
          <span className="font-semibold text-(--lg-text)">Админ-панель</span>
        </button>
      )}

      {[
        { label: 'История заказов', icon: Receipt, path: '/orders' },
        { label: 'Детализация бонусов', icon: Gift, path: '/profile/bonuses' },
        { label: 'Карта в Wallet', icon: CreditCard, path: '/profile/wallet' },
      ].map((item) => (
        <button
          key={item.path}
          type="button"
          onClick={() => router.push(item.path)}
          className="glass-panel lg-interactive mb-2 flex w-full cursor-pointer items-center gap-3 p-4 text-left"
        >
          <item.icon className="size-5 shrink-0 text-(--lg-text-muted)" strokeWidth={1.75} />
          <span className="font-medium text-(--lg-text)">{item.label}</span>
        </button>
      ))}

      <button type="button" className="profile-logout mt-8" onClick={handleLogout}>
        <LogOut className="size-4 shrink-0" strokeWidth={2} />
        Выйти
      </button>
      </div>

      {portalReady &&
        avatarModalOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-photo-dialog-title"
            className="search-modal-backdrop fixed inset-0 z-1500 flex items-center justify-center p-4 transition-opacity duration-200"
            onClick={() => setAvatarModalOpen(false)}
          >
            <div
              className="glass-panel-strong w-full max-w-sm rounded-[1.75rem] p-6 shadow-(--lg-shadow-strong)"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2
                  id="avatar-photo-dialog-title"
                  className="text-lg font-semibold tracking-tight text-(--lg-text)"
                >
                  Фото профиля
                </h2>
                <button
                  type="button"
                  className="btn-icon size-9 min-h-0 min-w-0 shrink-0"
                  onClick={() => setAvatarModalOpen(false)}
                  aria-label="Закрыть"
                >
                  <X className="size-4" strokeWidth={2} />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" className="btn-primary w-full py-3" onClick={handleReplacePhoto}>
                  Заменить фото
                </button>
                <button
                  type="button"
                  className="profile-logout w-full py-3"
                  onClick={async () => {
                    setAvatarModalOpen(false);
                    await handleAvatarRemove();
                  }}
                >
                  Удалить фото
                </button>
                <button
                  type="button"
                  className="btn-ghost w-full py-2.5"
                  onClick={() => setAvatarModalOpen(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
