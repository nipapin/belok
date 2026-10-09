"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ImageOff } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { variantCountLabel } from "@/lib/productTitle";
import SortableList from "@/components/admin/SortableList";
import { fetchAdminJson } from "@/lib/adminDashboard";
import "./products.css";

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
  variants?: { id: string }[];
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

  const {
    data: productsData,
    isPending: loadingProducts,
    isError: productsError,
    refetch,
  } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () =>
      fetchAdminJson<{ products: Product[] }>("/api/admin/products"),
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
          name: product.category?.name ?? "Без категории",
          sortOrder: product.category?.sortOrder ?? 0,
          products: [product],
        });
      }
    }
    return Array.from(map.values())
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"),
      )
      .map((group) => ({
        ...group,
        products: [...group.products].sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"),
        ),
      }));
  }, [productsData]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/products/${id}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      setPendingDelete(null);
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({
      id,
      isAvailable,
    }: {
      id: string;
      isAvailable: boolean;
    }) => {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onMutate: async ({ id, isAvailable }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-products"] });
      const prev = queryClient.getQueryData<{ products: Product[] }>([
        "admin-products",
      ]);
      if (prev) {
        queryClient.setQueryData(["admin-products"], {
          ...prev,
          products: prev.products.map((p) =>
            p.id === id ? { ...p, isAvailable } : p,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["admin-products"], ctx.prev);
    },
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (nextInCategory: Product[]) => {
      const res = await fetch("/api/admin/products/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: nextInCategory.map((p, index) => ({
            id: p.id,
            sortOrder: index,
          })),
        }),
      });
      if (!res.ok) throw new Error();
    },
    onMutate: async (nextInCategory) => {
      await queryClient.cancelQueries({ queryKey: ["admin-products"] });
      const prev = queryClient.getQueryData<{ products: Product[] }>([
        "admin-products",
      ]);
      if (prev) {
        const order = new Map(nextInCategory.map((p, i) => [p.id, i]));
        queryClient.setQueryData(["admin-products"], {
          ...prev,
          products: prev.products.map((p) =>
            order.has(p.id) ? { ...p, sortOrder: order.get(p.id)! } : p,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["admin-products"], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
  });

  const toggleVisibility = (product: Product) => {
    toggleVisibilityMutation.mutate({
      id: product.id,
      isAvailable: !product.isAvailable,
    });
  };

  return (
    <div className="admin-products">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="heading-section m-0">Товары</h1>
          <p className="mt-1 text-sm text-(--lg-text-muted)">
            Перетащите блюда внутри категории — так они будут стоять в меню.
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="btn-primary admin-product-add inline-flex items-center gap-2 py-2.5 text-sm"
        >
          <Plus className="size-4" />
          Добавить
        </Link>
      </div>

      {loadingProducts && (
        <p role="status" className="mb-4 text-sm text-(--lg-text-muted)">
          Загружаем товары…
        </p>
      )}
      {productsError && (
        <div role="alert" className="admin-product-error">
          Не удалось загрузить товары.{" "}
          <button type="button" onClick={() => void refetch()}>
            Повторить
          </button>
        </div>
      )}
      {(toggleVisibilityMutation.isError ||
        reorderMutation.isError ||
        deleteMutation.isError) && (
        <p role="alert" className="admin-product-error">
          Не удалось сохранить изменение. Попробуйте ещё раз.
        </p>
      )}
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.id}>
            <h2 className="mb-3 text-base font-semibold text-(--lg-text)">
              {group.name}
            </h2>
            <SortableList
              items={group.products}
              handlePlacement="overlay"
              getItemLabel={(product) => product.name}
              disabled={
                reorderMutation.isPending ||
                toggleVisibilityMutation.isPending ||
                deleteMutation.isPending
              }
              onReorder={(next) => reorderMutation.mutate(next)}
              renderItem={(product) => (
                <article
                  className="admin-product-card"
                  aria-label={product.name}
                >
                  <div className="admin-product-photo">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span
                        className="admin-product-no-photo"
                        aria-label="Без фото"
                      >
                        <ImageOff size={28} aria-hidden="true" />
                        <span>Без фото</span>
                      </span>
                    )}
                  </div>
                  <div className="admin-product-content">
                    <h3 className="admin-product-name" title={product.name}>
                      {product.name}
                    </h3>
                    <div className="admin-product-details">
                      <p className="admin-product-price">
                        {product.price} ₽
                        {(product.variants?.length ?? 0) > 0 ? (
                          <small>
                            {variantCountLabel(product.variants!.length)}
                          </small>
                        ) : null}
                      </p>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={product.isAvailable}
                        aria-label={`В меню: ${product.name}`}
                        aria-busy={
                          toggleVisibilityMutation.isPending &&
                          toggleVisibilityMutation.variables?.id === product.id
                        }
                        disabled={
                          toggleVisibilityMutation.isPending ||
                          reorderMutation.isPending ||
                          deleteMutation.isPending
                        }
                        onClick={() => toggleVisibility(product)}
                        className="admin-product-visibility"
                      >
                        <span className="admin-product-visibility-label">
                          {product.isAvailable ? "В меню" : "Скрыт"}
                        </span>
                        <span
                          className="admin-product-switch-track"
                          aria-hidden="true"
                        >
                          <span />
                        </span>
                      </button>
                    </div>
                    <div className="admin-product-actions">
                      <Link
                        href={`/admin/products/${product.id}/edit`}
                        className="admin-product-edit"
                        aria-label={`Изменить товар: ${product.name}`}
                      >
                        <Pencil size={17} aria-hidden="true" />
                        <span className="admin-product-edit-full">
                          Изменить
                        </span>
                        <span className="admin-product-edit-compact">
                          Править
                        </span>
                      </Link>
                      <button
                        type="button"
                        className="admin-product-delete"
                        onClick={() => setPendingDelete(product)}
                        aria-label={`Удалить товар: ${product.name}`}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 size={19} aria-hidden="true" />
                        <span>Удалить</span>
                      </button>
                    </div>
                  </div>
                </article>
              )}
            />
          </section>
        ))}
        {!loadingProducts && !productsError && groups.length === 0 ? (
          <p className="text-sm text-(--lg-text-muted)">
            Пока нет блюд — добавьте первое.
          </p>
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
              Товар{" "}
              <span className="font-semibold text-(--lg-text)">
                «{pendingDelete.name}»
              </span>{" "}
              будет удалён безвозвратно.
            </>
          )
        }
        confirmLabel="Удалить"
        loading={deleteMutation.isPending}
        onConfirm={() =>
          pendingDelete && deleteMutation.mutate(pendingDelete.id)
        }
      />
    </div>
  );
}
