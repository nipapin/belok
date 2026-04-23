'use client';

import Link from 'next/link';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
  });

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
                    <span
                      className={
                        product.isAvailable
                          ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                          : 'admin-chip-neutral'
                      }
                    >
                      {product.isAvailable ? 'Да' : 'Нет'}
                    </span>
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
                      onClick={() => {
                        if (window.confirm('Удалить товар?')) deleteMutation.mutate(product.id);
                      }}
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
              <span
                className={
                  product.isAvailable
                    ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                    : 'admin-chip-neutral'
                }
              >
                {product.isAvailable ? 'В меню' : 'Скрыт'}
              </span>
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
                  onClick={() => {
                    if (window.confirm('Удалить товар?')) deleteMutation.mutate(product.id);
                  }}
                  aria-label="Удалить"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
