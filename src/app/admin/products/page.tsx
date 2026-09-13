'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import SortableList from '@/components/admin/SortableList';

interface Ingredient {
  id: string;
  name: string;
  price: number;
}

interface ProductIngredient {
  ingredientId: string;
  ingredient: Ingredient;
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  categoryId: string;
  isAvailable: boolean;
  calories: number | null;
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  fiber: number | null;
  weightGrams: number | null;
  sortOrder: number;
  category: { id: string; name: string; sortOrder?: number };
  ingredients: ProductIngredient[];
}

interface CategoryGroup {
  id: string;
  name: string;
  sortOrder: number;
  products: Product[];
}

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  const { data: productsData } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => fetch('/api/admin/products').then((r) => r.json()),
  });

  const groups = useMemo<CategoryGroup[]>(() => {
    const list: Product[] = productsData?.products ?? [];
    const map = new Map<string, CategoryGroup>();
    for (const product of list) {
      const id = product.categoryId;
      const existing = map.get(id);
      if (existing) {
        existing.products.push(product);
      } else {
        map.set(id, {
          id,
          name: product.category?.name ?? 'Без категории',
          sortOrder: product.category?.sortOrder ?? 0,
          products: [product],
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
      .map((group) => ({
        ...group,
        products: [...group.products].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')
        ),
      }));
  }, [productsData]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/products/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setPendingDelete(null);
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onMutate: async ({ id, isAvailable }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-products'] });
      const prev = queryClient.getQueryData<{ products: Product[] }>(['admin-products']);
      if (prev) {
        queryClient.setQueryData(['admin-products'], {
          ...prev,
          products: prev.products.map((p) => (p.id === id ? { ...p, isAvailable } : p)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin-products'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (nextInCategory: Product[]) => {
      const res = await fetch('/api/admin/products/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: nextInCategory.map((p, index) => ({ id: p.id, sortOrder: index })),
        }),
      });
      if (!res.ok) throw new Error();
    },
    onMutate: async (nextInCategory) => {
      await queryClient.cancelQueries({ queryKey: ['admin-products'] });
      const prev = queryClient.getQueryData<{ products: Product[] }>(['admin-products']);
      if (prev) {
        const order = new Map(nextInCategory.map((p, i) => [p.id, i]));
        queryClient.setQueryData(['admin-products'], {
          ...prev,
          products: prev.products.map((p) =>
            order.has(p.id) ? { ...p, sortOrder: order.get(p.id)! } : p
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin-products'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
  });

  const toggleVisibility = (product: Product) => {
    toggleVisibilityMutation.mutate({ id: product.id, isAvailable: !product.isAvailable });
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="heading-section m-0">Товары</h1>
          <p className="mt-1 text-sm text-(--lg-text-muted)">
            Перетащите блюда внутри категории — так они будут стоять в меню.
          </p>
        </div>
        <Link href="/admin/products/new" className="btn-primary inline-flex items-center gap-2 py-2.5 text-sm">
          <Plus className="size-4" />
          Добавить
        </Link>
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.id}>
            <h2 className="mb-3 text-base font-semibold text-(--lg-text)">{group.name}</h2>
            <SortableList
              items={group.products}
              onReorder={(next) => reorderMutation.mutate(next)}
              renderItem={(product) => (
                <div className="glass-panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image}
                        alt=""
                        className="size-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] text-sm font-bold text-(--lg-text-muted)">
                        {product.name[0]}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-(--lg-text)">{product.name}</p>
                      <p className="mt-0.5 text-sm tabular-nums text-(--lg-text-muted)">{product.price} ₽</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => toggleVisibility(product)}
                      className={
                        product.isAvailable
                          ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200'
                          : 'admin-chip-neutral inline-flex items-center gap-1.5 px-2.5 py-1 transition hover:opacity-80'
                      }
                      aria-label={product.isAvailable ? 'Скрыть из меню' : 'Показать в меню'}
                    >
                      {product.isAvailable ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      {product.isAvailable ? 'В меню' : 'Скрыт'}
                    </button>
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="btn-icon inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
                      aria-label="Изменить"
                    >
                      <Pencil className="size-4" />
                    </Link>
                    <button
                      type="button"
                      className="btn-icon inline-flex size-9 border-0 bg-transparent text-rose-600 shadow-none hover:bg-rose-50"
                      onClick={() => setPendingDelete(product)}
                      aria-label="Удалить"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            />
          </section>
        ))}
        {groups.length === 0 ? (
          <p className="text-sm text-(--lg-text-muted)">Пока нет блюд — добавьте первое.</p>
        ) : null}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => {
          if (!deleteMutation.isPending) setPendingDelete(null);
        }}
        title="Удалить товар?"
        description={
          pendingDelete && (
            <>
              Товар <span className="font-semibold text-(--lg-text)">«{pendingDelete.name}»</span>{' '}
              будет удалён безвозвратно.
            </>
          )
        }
        confirmLabel="Удалить"
        loading={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
