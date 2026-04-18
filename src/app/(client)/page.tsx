"use client";

import { ArrowRight, Flame } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import CategoryChip from "@/components/ui/category-chip";
import { Category, Product } from "@/types";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="pt-2 px-4 py-12 text-center text-[var(--lg-text-muted)]">Загрузка…</div>}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });

  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetch("/api/products/categories").then((r) => r.json()),
  });

  const products: Product[] = productsData?.products?.slice(0, 4) ?? [];
  const categories: Category[] = categoriesData?.categories ?? [];

  return (
    <div className="pt-2">
      <div className="mx-auto max-w-2xl px-4">
        <h2 className="heading-section mb-3">Категории</h2>
        <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto scrollbar-hide scroll-px-4 px-4 pt-2">
          {loadingCategories
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-11 w-[120px] shrink-0 animate-pulse rounded-full bg-white/25" />
              ))
            : categories.map((cat) => <CategoryChip key={cat.id} category={cat} selected={categoryParam === cat.id} />)}
        </div>

        <div className="mb-3 flex items-center gap-2">
          <Flame className="size-6 opacity-85 text-[var(--lg-text)]" strokeWidth={1.75} />
          <h2 className="heading-section m-0">Популярное</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {loadingProducts
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="lg-card h-[220px] animate-pulse border border-(--lg-ring) bg-(--lg-fill)" />
              ))
            : products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => router.push(`/menu/${product.id}`)}
                  className="lg-card lg-interactive group flex cursor-pointer flex-col overflow-hidden text-left"
                >
                  <div className="relative flex h-[140px] items-center justify-center overflow-hidden bg-zinc-100/50">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-4xl font-bold text-[var(--lg-text-muted)]">{product.name[0]}</span>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-black/28" aria-hidden />
                    {product.calories != null && (
                      <span className="lg-chip-float absolute left-2 top-2 z-[1]">{product.calories} ккал</span>
                    )}
                    <span className="lg-chip-float absolute bottom-2 right-2 z-[1] tabular-nums">{product.price} ₽</span>
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="truncate text-[0.9375rem] font-semibold leading-snug tracking-[-0.02em] text-[var(--lg-text)]">
                      {product.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--lg-text-muted)]">{product.category.name}</p>
                  </div>
                </button>
              ))}
        </div>

        <div className="mt-8 mb-4 text-center">
          <button type="button" className="btn-outline px-8" onClick={() => router.push("/menu")}>
            Всё меню
            <ArrowRight className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
