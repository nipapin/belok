'use client';

import { useMemo, useState } from 'react';
import { Flame, Plus, Save, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import SortableList from '@/components/admin/SortableList';

interface ProductLite {
  id: string;
  name: string;
  image: string | null;
  price: number;
  category?: { name: string };
}

export default function AdminHitsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const { data: hitsData, isLoading } = useQuery({
    queryKey: ['admin-hits'],
    queryFn: () => fetch('/api/admin/hits').then((r) => r.json()),
  });
  const savedIds: string[] = hitsData?.productIds ?? [];

  const { data: productsData } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => fetch('/api/admin/products').then((r) => r.json()),
  });
  const products: ProductLite[] = useMemo(
    () => (productsData?.products ?? []) as ProductLite[],
    [productsData]
  );
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [dirtyIds, setDirtyIds] = useState<string[] | null>(null);
  const productIds = dirtyIds ?? savedIds;
  const selected = productIds
    .map((id) => productMap.get(id))
    .filter((p): p is ProductLite => Boolean(p));

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return products
      .filter((p) => !productIds.includes(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, productIds, query]);

  const saveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/admin/hits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: ids }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(['admin-hits'], payload);
      setDirtyIds(null);
      setSaved(true);
      setError('');
      window.setTimeout(() => setSaved(false), 2500);
    },
    onError: () => setError('Не удалось сохранить хиты'),
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="heading-section m-0">Хиты</h1>
          <p className="mt-1 text-sm text-(--lg-text-muted)">
            Этот список показывается на главной вместо «Популярное». Перетащите, чтобы задать порядок.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-2 py-2.5 text-sm disabled:opacity-50"
          onClick={() => saveMutation.mutate(productIds)}
          disabled={saveMutation.isPending || dirtyIds === null}
        >
          <Save className="size-4" />
          {saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>

      {saved ? (
        <div className="mb-4 rounded-2xl border border-emerald-200/80 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          Хиты сохранены
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200/80 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="relative mb-6">
        <label className="mb-1.5 block text-sm font-medium text-(--lg-text)">Добавить блюдо</label>
        <input
          className="input-pill w-full py-2.5 text-sm"
          placeholder="Начните вводить название"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searchResults.length > 0 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-(--lg-ring) bg-(--lg-fill) shadow-(--lg-shadow)">
            {searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
                onClick={() => {
                  setDirtyIds([...productIds, p.id]);
                  setQuery('');
                }}
              >
                <Plus className="size-4 shrink-0 text-(--lg-text-muted)" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="tabular-nums text-xs text-(--lg-text-muted)">{p.price} ₽</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]" />
      ) : selected.length === 0 ? (
        <div className="glass-panel flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Flame className="size-8 text-(--lg-text-muted)" strokeWidth={1.5} />
          <p className="text-sm text-(--lg-text-muted)">Пока нет хитов — найдите блюдо выше и добавьте его в список.</p>
        </div>
      ) : (
        <SortableList
          items={selected}
          onReorder={(next) => setDirtyIds(next.map((p) => p.id))}
          renderItem={(product) => (
            <div className="glass-panel flex items-center gap-3 p-3">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image} alt="" className="size-12 rounded-xl object-cover" />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] text-sm font-bold text-(--lg-text-muted)">
                  {product.name[0]}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-(--lg-text)">{product.name}</p>
                <p className="text-xs text-(--lg-text-muted)">
                  {product.category?.name ?? 'Без категории'} · {product.price} ₽
                </p>
              </div>
              <button
                type="button"
                className="btn-icon size-9 border-0 bg-transparent text-rose-600 shadow-none hover:bg-rose-50"
                onClick={() => setDirtyIds(productIds.filter((id) => id !== product.id))}
                aria-label="Убрать из хитов"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}
        />
      )}
    </div>
  );
}
