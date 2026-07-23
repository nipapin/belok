'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  WALKTHROUGH_ICONS,
  WALKTHROUGH_ICON_LABELS,
  WALKTHROUGH_MAX_SLIDES,
  type WalkthroughConfig,
  type WalkthroughSlide,
} from '@/lib/walkthrough';

const textareaClass =
  'mt-1 w-full rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-4 py-2.5 text-sm text-(--lg-text) outline-none transition placeholder:text-(--lg-text-muted) focus:border-(--lg-ring-strong)';

export default function AdminWalkthroughPage() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [bumpVersion, setBumpVersion] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-walkthrough'],
    queryFn: () => fetch('/api/admin/walkthrough').then((r) => r.json()),
  });
  const serverConfig = data?.config as WalkthroughConfig | undefined;

  const [dirty, setDirty] = useState<{ enabled: boolean; slides: WalkthroughSlide[] } | null>(null);
  const enabled = dirty?.enabled ?? serverConfig?.enabled ?? true;
  const slides = dirty?.slides ?? serverConfig?.slides ?? [];

  const edit = (next: Partial<{ enabled: boolean; slides: WalkthroughSlide[] }>) =>
    setDirty({ enabled, slides, ...next });

  const updateSlide = (index: number, field: keyof WalkthroughSlide, value: string) =>
    edit({ slides: slides.map((s, i) => (i === index ? { ...s, [field]: value } : s)) });

  const moveSlide = (index: number, dir: -1 | 1) => {
    const next = [...slides];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    edit({ slides: next });
  };

  const removeSlide = (index: number) => edit({ slides: slides.filter((_, i) => i !== index) });

  const addSlide = () =>
    edit({ slides: [...slides, { icon: 'sparkles', title: 'Новый слайд', text: '' }] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/walkthrough', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, slides, bumpVersion }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Ошибка сохранения');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-walkthrough'] });
      queryClient.invalidateQueries({ queryKey: ['walkthrough'] });
      setDirty(null);
      setBumpVersion(false);
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-tight h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="heading-section mb-2">Приветствие для новых</h1>
      <p className="mb-6 text-sm text-(--lg-text-muted)">
        Слайды, которые видит новый посетитель при первом открытии сайта. На последнем слайде
        автоматически появляются кнопки «Создать аккаунт» и «Смотреть меню».
      </p>

      {saved && (
        <div className="mb-4 rounded-2xl border border-emerald-200/80 bg-emerald-50 px-2 py-3 text-sm text-emerald-900">
          Сохранено{serverConfig ? ` · версия ${serverConfig.version}` : ''}
        </div>
      )}
      {error && <p className="auth-alert-error mb-4">{error}</p>}

      <label className="glass-panel mb-4 flex cursor-pointer items-center justify-between gap-3 p-4">
        <span>
          <span className="block text-sm font-semibold text-(--lg-text)">Показывать приветствие</span>
          <span className="block text-xs text-(--lg-text-muted)">
            Выключите, чтобы временно скрыть у всех
          </span>
        </span>
        <input
          type="checkbox"
          className="size-5 accent-[#18181b]"
          checked={enabled}
          onChange={(e) => edit({ enabled: e.target.checked })}
        />
      </label>

      <div className="space-y-3">
        {slides.map((s, i) => (
          <div key={i} className="glass-panel space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-(--lg-text-muted)">
                Слайд {i + 1}
                {i === slides.length - 1 ? ' · финальный (с кнопками)' : ''}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn-icon size-8 disabled:opacity-40"
                  onClick={() => moveSlide(i, -1)}
                  disabled={i === 0}
                  aria-label="Выше"
                >
                  <ArrowUp className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="btn-icon size-8 disabled:opacity-40"
                  onClick={() => moveSlide(i, 1)}
                  disabled={i === slides.length - 1}
                  aria-label="Ниже"
                >
                  <ArrowDown className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="btn-icon size-8 text-rose-500 disabled:opacity-40"
                  onClick={() => removeSlide(i)}
                  disabled={slides.length <= 1}
                  aria-label="Удалить слайд"
                >
                  <Trash2 className="size-4" strokeWidth={2} />
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
              <label className="block text-sm font-medium text-(--lg-text)">
                Заголовок
                <input
                  className="input-pill mt-1 py-2 text-sm"
                  maxLength={80}
                  value={s.title}
                  onChange={(e) => updateSlide(i, 'title', e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-(--lg-text)">
                Иконка
                <select
                  className="select-pill mt-1 py-2 text-sm"
                  value={s.icon}
                  onChange={(e) => updateSlide(i, 'icon', e.target.value)}
                >
                  {WALKTHROUGH_ICONS.map((key) => (
                    <option key={key} value={key}>
                      {WALKTHROUGH_ICON_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium text-(--lg-text)">
              Текст
              <textarea
                className={textareaClass}
                rows={3}
                maxLength={300}
                value={s.text}
                onChange={(e) => updateSlide(i, 'text', e.target.value)}
              />
            </label>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn-ghost mt-3 w-full py-2.5 disabled:opacity-50"
        onClick={addSlide}
        disabled={slides.length >= WALKTHROUGH_MAX_SLIDES}
      >
        <Plus className="size-4" strokeWidth={2} />
        Добавить слайд
      </button>

      <label className="glass-panel mt-6 flex cursor-pointer items-center justify-between gap-3 p-4">
        <span>
          <span className="block text-sm font-semibold text-(--lg-text)">Показать заново всем</span>
          <span className="block text-xs text-(--lg-text-muted)">
            При сохранении приветствие увидят даже те, кто уже закрывал его
          </span>
        </span>
        <input
          type="checkbox"
          className="size-5 accent-[#18181b]"
          checked={bumpVersion}
          onChange={(e) => setBumpVersion(e.target.checked)}
        />
      </label>

      <button
        type="button"
        className="btn-primary mt-4 w-full gap-2 py-3 disabled:opacity-50"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || slides.length === 0}
      >
        <Save className="size-4" />
        {saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
      </button>
    </div>
  );
}
