'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

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
  sortOrder: number;
  category: { id: string; name: string };
  ingredients: ProductIngredient[];
}

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  const { data: productsData } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => fetch('/api/admin/products').then((r) => r.json()),
  });

  const products: Product[] = productsData?.products ?? [];

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

  const toggleVisibility = (product: Product) => {
    toggleVisibilityMutation.mutate({ id: product.id, isAvailable: !product.isAvailable });
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-section m-0">Товары</h1>
        <Link href="/admin/products/new" className="btn-primary inline-flex items-center gap-2 py-2.5 text-sm">
          <Plus className="size-4" />
          Добавить
        </Link>
      </div>

      <div className="hidden min-[900px]:block">
        <div className="admin-table-wrap overflow-x-auto">
          <table className="admin-table min-w-[720px]">
            <thead>
              <tr>
                <th>Название</th>
                <th>Категория</th>
                <th>Цена</th>
                <th>В меню</th>
                <th className="text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      {product.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt=""
                          className="size-10 rounded-xl object-cover"
                        />
                      )}
                      <span className="font-medium">{product.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="admin-chip-neutral font-medium">{product.category.name}</span>
                  </td>
                  <td>{product.price} ₽</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleVisibility(product)}
                      className={
                        product.isAvailable
                          ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200'
                          : 'admin-chip-neutral inline-flex items-center gap-1.5 px-2 py-1 transition hover:opacity-80'
                      }
                      aria-label={product.isAvailable ? 'Скрыть из меню' : 'Показать в меню'}
                      title={product.isAvailable ? 'Скрыть из меню' : 'Показать в меню'}
                    >
                      {product.isAvailable ? (
                        <Eye className="size-3.5" />
                      ) : (
                        <EyeOff className="size-3.5" />
                      )}
                      {product.isAvailable ? 'Да' : 'Нет'}
                    </button>
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="btn-icon mr-1 inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 min-[900px]:hidden">
        {products.map((product) => (
          <div
            key={product.id}
            className="glass-panel flex flex-col gap-3 p-4"
          >
            <div className="flex gap-3">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image}
                  alt=""
                  className="size-14 shrink-0 rounded-xl object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-(--lg-text)">{product.name}</p>
                <p className="mt-1">
                  <span className="admin-chip-neutral text-xs font-medium">{product.category.name}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] pt-3 text-sm">
              <span className="font-semibold tabular-nums text-(--lg-text)">{product.price} ₽</span>
              <button
                type="button"
                onClick={() => toggleVisibility(product)}
                className={
                  product.isAvailable
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200'
                    : 'admin-chip-neutral inline-flex items-center gap-1.5 px-2.5 py-1 transition hover:opacity-80'
                }
                aria-label={product.isAvailable ? 'Скрыть из меню' : 'Показать в меню'}
                title={product.isAvailable ? 'Скрыть из меню' : 'Показать в меню'}
              >
                {product.isAvailable ? (
                  <Eye className="size-3.5" />
                ) : (
                  <EyeOff className="size-3.5" />
                )}
                {product.isAvailable ? 'В меню' : 'Скрыт'}
              </button>
              <div className="ml-auto flex gap-1">
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
          </div>
        ))}
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
