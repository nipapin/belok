'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCircle2,
  Loader2,
  Send,
  UserCircle2,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import Image from 'next/image';

type AudienceType = 'ALL' | 'LOYALTY_LEVEL' | 'USER';

interface LoyaltyLevel {
  id: string;
  name: string;
  cashbackPercent: number;
  discountPercent: number;
  minSpent: number;
  _count?: { users: number };
}

interface UserSearchResult {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  has_subscription: boolean;
}

interface HistoryItem {
  id: string;
  title: string;
  body: string;
  url: string | null;
  audienceType: AudienceType;
  audienceLabel: string | null;
  recipientCount: number;
  deliveredCount: number;
  createdAt: string;
  sentBy: string | null;
}

const audienceLabel = (item: HistoryItem) => {
  if (item.audienceType === 'ALL') return 'Все пользователи';
  if (item.audienceType === 'LOYALTY_LEVEL')
    return `Уровень: ${item.audienceLabel ?? '—'}`;
  return `Лично: ${item.audienceLabel ?? '—'}`;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function AdminNotificationsPage() {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [audienceType, setAudienceType] = useState<AudienceType>('ALL');
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendOk, setSendOk] = useState<{ recipients: number; delivered: number } | null>(
    null
  );

  // ---- Loyalty levels (for the audience picker) ----
  const { data: settingsData } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => fetch('/api/admin/settings').then((r) => r.json()),
  });
  const levels = (settingsData?.levels ?? []) as LoyaltyLevel[];

  // ---- History feed ----
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => fetch('/api/admin/notifications').then((r) => r.json()),
  });
  const history = (historyData?.notifications ?? []) as HistoryItem[];

  // ---- User search (debounced) ----
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (audienceType !== 'USER') return;
    if (!userQuery.trim() || userQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/users/search?q=${encodeURIComponent(userQuery.trim())}`
        );
        const data = await res.json();
        setSearchResults(data.users ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [userQuery, audienceType]);

  // ---- Form helpers ----
  const audienceValid = useMemo(() => {
    if (audienceType === 'ALL') return true;
    if (audienceType === 'LOYALTY_LEVEL') return !!selectedLevelId;
    if (audienceType === 'USER') return !!selectedUser;
    return false;
  }, [audienceType, selectedLevelId, selectedUser]);

  const titleTrim = title.trim();
  const bodyTrim = body.trim();
  const canSend =
    !sending &&
    titleTrim.length > 0 &&
    titleTrim.length <= 80 &&
    bodyTrim.length > 0 &&
    bodyTrim.length <= 240 &&
    audienceValid;

  const audienceCount = useMemo(() => {
    if (audienceType === 'ALL') return null; // unknown without a separate count endpoint
    if (audienceType === 'LOYALTY_LEVEL') {
      const level = levels.find((l) => l.id === selectedLevelId);
      return level?._count?.users ?? null;
    }
    if (audienceType === 'USER') return selectedUser ? 1 : null;
    return null;
  }, [audienceType, selectedLevelId, selectedUser, levels]);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setSendError('');
    setSendOk(null);
    try {
      const audience: { type: AudienceType; loyaltyLevelId?: string; userId?: string } =
        audienceType === 'ALL'
          ? { type: 'ALL' }
          : audienceType === 'LOYALTY_LEVEL'
            ? { type: 'LOYALTY_LEVEL', loyaltyLevelId: selectedLevelId! }
            : { type: 'USER', userId: selectedUser!.id };

      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleTrim,
          body: bodyTrim,
          url: url.trim() || undefined,
          audience,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(typeof data.error === 'string' ? data.error : 'Ошибка отправки');
        return;
      }
      setSendOk({ recipients: data.recipients, delivered: data.delivered });
      setTitle('');
      setBody('');
      setUrl('');
      void queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
    } catch {
      setSendError('Ошибка соединения');
    } finally {
      setSending(false);
    }
  };

  const pickUser = useCallback((u: UserSearchResult) => {
    setSelectedUser(u);
    setUserQuery(u.name || u.email || '');
    setSearchOpen(false);
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-2 pb-12 pt-2">
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-(--lg-fill) ring-1 ring-(--lg-ring)">
          <Bell className="size-5 text-(--lg-text)" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-(--lg-text)">
            Push-уведомления
          </h1>
          <p className="text-sm text-(--lg-text-muted)">
            Отправьте сообщение всем, по уровню лояльности или конкретному пользователю
          </p>
        </div>
      </header>

      {/* Composer */}
      <div className="glass-panel-strong p-5 sm:p-6">
        <div className="space-y-4">
          {/* Audience selector */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-(--lg-text-muted)">
              Кому отправить
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'ALL', label: 'Всем', icon: UsersIcon },
                  { id: 'LOYALTY_LEVEL', label: 'По уровню', icon: Bell },
                  { id: 'USER', label: 'Лично', icon: UserCircle2 },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = audienceType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setAudienceType(opt.id as AudienceType);
                      setSelectedLevelId(null);
                      setSelectedUser(null);
                      setUserQuery('');
                    }}
                    className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? 'border-(--lg-ring-strong) bg-[#18181b] text-white shadow-(--lg-shadow)'
                        : 'border-(--lg-ring) text-(--lg-text) hover:border-(--lg-ring-strong) hover:bg-(--lg-fill-hover)'
                    }`}
                  >
                    <Icon className="size-4" strokeWidth={active ? 2 : 1.75} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {audienceType === 'LOYALTY_LEVEL' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {levels.length === 0 && (
                <p className="text-sm text-(--lg-text-muted)">Уровни лояльности не созданы</p>
              )}
              {levels.map((level) => {
                const active = selectedLevelId === level.id;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => setSelectedLevelId(level.id)}
                    className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                      active
                        ? 'border-(--lg-ring-strong) bg-(--lg-fill-hover)'
                        : 'border-(--lg-ring) hover:border-(--lg-ring-strong) hover:bg-(--lg-fill)'
                    }`}
                  >
                    <span>
                      <span className="block font-semibold text-(--lg-text)">{level.name}</span>
                      <span className="text-xs text-(--lg-text-muted)">
                        от {Math.round(level.minSpent)} ₽ · кэшбэк {level.cashbackPercent}%
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-(--lg-text-muted)">
                      {level._count?.users ?? 0} 👤
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {audienceType === 'USER' && (
            <div className="relative">
              <input
                value={userQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setUserQuery(e.target.value);
                  setSelectedUser(null);
                  setSearchOpen(true);
                }}
                placeholder="Имя или email"
                className="input-pill w-full min-h-11"
              />
              {selectedUser && (
                <button
                  type="button"
                  aria-label="Сбросить"
                  onClick={() => {
                    setSelectedUser(null);
                    setUserQuery('');
                    setSearchOpen(false);
                  }}
                  className="btn-icon absolute right-2 top-1/2 size-8 -translate-y-1/2"
                >
                  <X className="size-4" />
                </button>
              )}
              {searchOpen && userQuery.trim().length >= 2 && !selectedUser && (
                <div className="glass-panel absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto p-1">
                  {searching && (
                    <div className="flex items-center justify-center gap-2 p-3 text-sm text-(--lg-text-muted)">
                      <Loader2 className="size-4 animate-spin" /> Ищем…
                    </div>
                  )}
                  {!searching && searchResults.length === 0 && (
                    <div className="p-3 text-sm text-(--lg-text-muted)">Никого не найдено</div>
                  )}
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => pickUser(u)}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm hover:bg-(--lg-fill-hover)"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--lg-fill) ring-1 ring-(--lg-ring)">
                        {u.avatarUrl ? (
                          <Image src={u.avatarUrl} alt="" width={36} height={36} unoptimized />
                        ) : (
                          <UserCircle2 className="size-6 text-(--lg-text-muted)" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-(--lg-text)">
                          {u.name || u.email || u.id}
                        </div>
                        {u.email && u.name && (
                          <div className="truncate text-xs text-(--lg-text-muted)">{u.email}</div>
                        )}
                      </div>
                      {!u.has_subscription && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                          без push
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selectedUser && !selectedUser.has_subscription && (
                <p className="mt-2 text-xs text-amber-300">
                  У этого пользователя нет активных push-подписок — сообщение не будет
                  доставлено.
                </p>
              )}
            </div>
          )}

          <hr className="border-(--lg-ring)" />

          {/* Title */}
          <div>
            <label
              htmlFor="push-title"
              className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-(--lg-text-muted)"
            >
              <span>Заголовок</span>
              <span className={titleTrim.length > 80 ? 'text-rose-400' : ''}>
                {titleTrim.length} / 80
              </span>
            </label>
            <input
              id="push-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Например: Сегодня скидка 20%"
              className="input-pill w-full min-h-11"
            />
          </div>

          {/* Body */}
          <div>
            <label
              htmlFor="push-body"
              className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-(--lg-text-muted)"
            >
              <span>Текст</span>
              <span className={bodyTrim.length > 240 ? 'text-rose-400' : ''}>
                {bodyTrim.length} / 240
              </span>
            </label>
            <textarea
              id="push-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Что хотите сообщить?"
              className="input-pill block w-full resize-none p-3"
            />
          </div>

          {/* URL */}
          <div>
            <label
              htmlFor="push-url"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-(--lg-text-muted)"
            >
              Ссылка по тапу (опционально)
            </label>
            <input
              id="push-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/menu  или  https://..."
              className="input-pill w-full min-h-11"
            />
          </div>

          {/* Preview */}
          {(titleTrim || bodyTrim) && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--lg-text-muted)">
                Превью
              </p>
              <div className="rounded-3xl border border-(--lg-ring) bg-[#18181b]/85 p-4 text-white shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-white/8">
                    <Bell className="size-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wider text-white/60">бело́к</p>
                    <p className="mt-0.5 truncate text-sm font-semibold">
                      {titleTrim || 'Заголовок'}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-white/85">
                      {bodyTrim || 'Текст уведомления появится здесь'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {sendError && <div className="auth-alert-error">{sendError}</div>}
          {sendOk && (
            <div className="profile-alert-success flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              Отправлено! Получателей: {sendOk.recipients}, доставлено: {sendOk.delivered}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-(--lg-text-muted)">
              {audienceType === 'ALL' && 'Будут оповещены все, у кого включены уведомления'}
              {audienceType === 'LOYALTY_LEVEL' && audienceCount !== null &&
                `Пользователей в уровне: ${audienceCount}`}
              {audienceType === 'USER' && selectedUser &&
                `Получатель: ${selectedUser.name || selectedUser.email}`}
            </p>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? 'Отправляем…' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      <div>
        <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-(--lg-text-muted)">
          История рассылок
        </h2>
        {historyLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="size-6 animate-spin text-(--lg-text-muted)" />
          </div>
        ) : history.length === 0 ? (
          <div className="glass-panel p-6 text-center text-sm text-(--lg-text-muted)">
            Пока ничего не отправляли
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div key={item.id} className="glass-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-(--lg-text)">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-(--lg-text-muted)">{item.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-(--lg-text-muted)">
                      <span className="rounded-full bg-(--lg-fill) px-2 py-0.5 ring-1 ring-(--lg-ring)">
                        {audienceLabel(item)}
                      </span>
                      <span>
                        Доставлено {item.deliveredCount} / {item.recipientCount}
                      </span>
                      {item.sentBy && <span>· {item.sentBy}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-(--lg-text-muted)">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
