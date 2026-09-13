'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Home,
  ImagePlus,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  HOME_LAYOUT_MAX_BLOCKS,
  HOME_LAYOUT_MAX_IMAGES,
  createEmptyBlock,
  type HomeBlock,
  type HomeBlockType,
  type HomeLayoutConfig,
} from '@/lib/homeLayout';

const textareaClass =
  'mt-1 w-full rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-4 py-2.5 text-sm text-(--lg-text) outline-none transition placeholder:text-(--lg-text-muted) focus:border-(--lg-ring-strong)';

const BLOCK_TYPE_LABELS: Record<HomeBlockType, string> = {
  text: 'Текст',
  gallery: 'Текст + картинки',
  products: 'Товары',
  categories: 'Категории',
  contacts: 'Контакты',
};

async function uploadContentImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', 'content');
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Ошибка загрузки');
  return data.url as string;
}

export default function AdminHomePage() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [addType, setAddType] = useState<HomeBlockType>('gallery');
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-home-layout'],
    queryFn: () => fetch('/api/admin/home-layout').then((r) => r.json()),
  });
  const serverConfig = data?.config as HomeLayoutConfig | undefined;

  const { data: productsData } = useQuery({
    queryKey: ['admin-products-lite'],
    queryFn: () => fetch('/api/admin/products').then((r) => r.json()),
  });
  const products: { id: string; name: string }[] = useMemo(
    () =>
      ((productsData?.products ?? []) as { id: string; name: string }[]).map((p) => ({
        id: p.id,
        name: p.name,
      })),
    [productsData]
  );

  const [dirtyBlocks, setDirtyBlocks] = useState<HomeBlock[] | null>(null);
  const blocks = dirtyBlocks ?? serverConfig?.blocks ?? [];

  const setBlocks = (next: HomeBlock[]) => setDirtyBlocks(next);

  const updateBlock = (index: number, patch: Partial<HomeBlock>) => {
    setBlocks(blocks.map((b, i) => (i === index ? ({ ...b, ...patch } as HomeBlock) : b)));
  };

  const moveBlock = (index: number, dir: -1 | 1) => {
    const next = [...blocks];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);
  };

  const removeBlock = (index: number) => setBlocks(blocks.filter((_, i) => i !== index));

  const addBlock = () => {
    if (blocks.length >= HOME_LAYOUT_MAX_BLOCKS) return;
    setBlocks([...blocks, createEmptyBlock(addType)]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/home-layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Ошибка сохранения');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-home-layout'] });
      queryClient.invalidateQueries({ queryKey: ['home-layout'] });
      setDirtyBlocks(null);
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleAddImage = async (index: number, file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const block = blocks[index];
    if (!block || block.type !== 'gallery') return;
    if (block.images.length >= HOME_LAYOUT_MAX_IMAGES) {
      setError(`Максимум ${HOME_LAYOUT_MAX_IMAGES} картинок в блоке`);
      return;
    }
    setUploadingId(block.id);
    setError('');
    try {
      const url = await uploadContentImage(file);
      updateBlock(index, { images: [...block.images, url] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploadingId(null);
    }
  };

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
      <h1 className="heading-section mb-2 flex items-center gap-2">
        <Home className="size-6 opacity-85" strokeWidth={1.75} />
        Главная страница
      </h1>
      <p className="mb-6 text-sm text-(--lg-text-muted)">
        Конструктор блоков на стартовой странице: «О нас», товары, категории, контакты. Порядок
        блоков — сверху вниз на сайте.
      </p>

      {saved && (
        <div className="mb-4 rounded-2xl border border-emerald-200/80 bg-emerald-50 px-2 py-3 text-sm text-emerald-900">
          Сохранено
        </div>
      )}
      {error && <p className="auth-alert-error mb-4">{error}</p>}

      <div className="space-y-3">
        {blocks.map((block, i) => (
          <div key={block.id} className="glass-panel space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-(--lg-text-muted)">
                {BLOCK_TYPE_LABELS[block.type]} · блок {i + 1}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn-icon size-8 disabled:opacity-40"
                  onClick={() => moveBlock(i, -1)}
                  disabled={i === 0}
                  aria-label="Выше"
                >
                  <ArrowUp className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="btn-icon size-8 disabled:opacity-40"
                  onClick={() => moveBlock(i, 1)}
                  disabled={i === blocks.length - 1}
                  aria-label="Ниже"
                >
                  <ArrowDown className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="btn-icon size-8 text-rose-500"
                  onClick={() => removeBlock(i)}
                  aria-label="Удалить блок"
                >
                  <Trash2 className="size-4" strokeWidth={2} />
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm font-medium text-(--lg-text)">Показывать на сайте</span>
              <input
                type="checkbox"
                className="size-5 accent-[#18181b]"
                checked={block.enabled}
                onChange={(e) => updateBlock(i, { enabled: e.target.checked })}
              />
            </label>

            <label className="block text-sm font-medium text-(--lg-text)">
              Заголовок
              <input
                className="input-pill mt-1 py-2 text-sm"
                maxLength={80}
                value={block.title}
                onChange={(e) => updateBlock(i, { title: e.target.value })}
              />
            </label>

            {(block.type === 'text' || block.type === 'gallery') && (
              <label className="block text-sm font-medium text-(--lg-text)">
                Текст
                <textarea
                  className={textareaClass}
                  rows={4}
                  maxLength={2000}
                  value={block.text}
                  onChange={(e) => updateBlock(i, { text: e.target.value })}
                />
              </label>
            )}

            {block.type === 'gallery' && (
              <div>
                <p className="mb-2 text-sm font-medium text-(--lg-text)">Картинки</p>
                {block.images.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {block.images.map((url, imgIndex) => (
                      <div
                        key={`${url}-${imgIndex}`}
                        className="relative size-20 overflow-hidden rounded-xl border border-(--lg-ring)"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="size-full object-cover" />
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-rose-600/90 p-1 text-white"
                          aria-label="Удалить картинку"
                          onClick={() =>
                            updateBlock(i, {
                              images: block.images.filter((_, j) => j !== imgIndex),
                            })
                          }
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="btn-ghost inline-flex cursor-pointer items-center gap-2 py-2 disabled:opacity-50">
                  <ImagePlus className="size-4" />
                  {uploadingId === block.id ? 'Загрузка…' : 'Добавить картинку'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/*"
                    className="sr-only"
                    disabled={
                      uploadingId === block.id || block.images.length >= HOME_LAYOUT_MAX_IMAGES
                    }
                    onChange={(e) => {
                      void handleAddImage(i, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            )}

            {block.type === 'products' && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-sm font-medium text-(--lg-text)">
                    Режим
                    <select
                      className="select-pill mt-1 py-2 text-sm"
                      value={block.mode}
                      onChange={(e) =>
                        updateBlock(i, {
                          mode:
                            e.target.value === 'picked'
                              ? 'picked'
                              : e.target.value === 'hits'
                                ? 'hits'
                                : 'latest',
                        })
                      }
                    >
                      <option value="hits">Хиты (из экрана Хиты)</option>
                      <option value="latest">Последние / первые</option>
                      <option value="picked">Выбранные</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-(--lg-text)">
                    Лимит
                    <input
                      type="number"
                      min={1}
                      max={24}
                      className="input-pill mt-1 py-2 text-sm"
                      value={block.limit}
                      onChange={(e) =>
                        updateBlock(i, {
                          limit: Math.min(24, Math.max(1, Number(e.target.value) || 1)),
                        })
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium text-(--lg-text)">
                    Вид
                    <select
                      className="select-pill mt-1 py-2 text-sm"
                      value={block.layout}
                      onChange={(e) =>
                        updateBlock(i, {
                          layout: e.target.value === 'carousel' ? 'carousel' : 'grid',
                        })
                      }
                    >
                      <option value="grid">Сетка</option>
                      <option value="carousel">Карусель</option>
                    </select>
                  </label>
                </div>
                {block.mode === 'hits' && (
                  <p className="text-xs text-(--lg-text-muted)">
                    Состав и порядок блюд задаются в разделе «Хиты».
                  </p>
                )}
                {block.mode === 'picked' && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-(--lg-text)">Выберите блюда</p>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-(--lg-ring) p-2">
                      {products.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-(--lg-text-muted)">Нет товаров</p>
                      ) : (
                        products.map((p) => {
                          const checked = block.productIds.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--lg-text)_4%,transparent)]"
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-[#18181b]"
                                checked={checked}
                                onChange={() => {
                                  const productIds = checked
                                    ? block.productIds.filter((id) => id !== p.id)
                                    : [...block.productIds, p.id];
                                  updateBlock(i, { productIds });
                                }}
                              />
                              {p.name}
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {block.type === 'contacts' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-(--lg-text)">
                  Телефон
                  <input
                    className="input-pill mt-1 py-2 text-sm"
                    maxLength={40}
                    placeholder="+7 …"
                    value={block.phone}
                    onChange={(e) => updateBlock(i, { phone: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-(--lg-text)">
                  Адрес
                  <input
                    className="input-pill mt-1 py-2 text-sm"
                    maxLength={200}
                    value={block.address}
                    onChange={(e) => updateBlock(i, { address: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-(--lg-text)">
                  Ссылка на карту
                  <input
                    className="input-pill mt-1 py-2 text-sm"
                    maxLength={500}
                    placeholder="https://yandex.ru/maps/…"
                    value={block.mapUrl}
                    onChange={(e) => updateBlock(i, { mapUrl: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-(--lg-text)">
                  Часы работы
                  <input
                    className="input-pill mt-1 py-2 text-sm"
                    maxLength={200}
                    placeholder="Пн–Пт 10:00–22:00"
                    value={block.hours}
                    onChange={(e) => updateBlock(i, { hours: e.target.value })}
                  />
                </label>
              </div>
            )}

            {block.type === 'categories' && (
              <p className="text-xs text-(--lg-text-muted)">
                На сайте отобразятся категории меню со ссылкой в раздел меню.
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="select-pill py-2.5 text-sm"
          value={addType}
          onChange={(e) => setAddType(e.target.value as HomeBlockType)}
        >
          {(Object.keys(BLOCK_TYPE_LABELS) as HomeBlockType[]).map((key) => (
            <option key={key} value={key}>
              {BLOCK_TYPE_LABELS[key]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-ghost flex-1 py-2.5 disabled:opacity-50 sm:flex-initial"
          onClick={addBlock}
          disabled={blocks.length >= HOME_LAYOUT_MAX_BLOCKS}
        >
          <Plus className="size-4" strokeWidth={2} />
          Добавить блок
        </button>
      </div>

      <button
        type="button"
        className="btn-primary mt-4 w-full gap-2 py-3 disabled:opacity-50"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        <Save className="size-4" />
        {saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
      </button>
    </div>
  );
}
