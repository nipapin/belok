"use client";

import { ArrowRight, Flame } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import CategoryChip from "@/components/ui/category-chip";
import { ProductCard } from "@/components/product/ProductCard";
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
                <div key={i} className="glass-tight h-[240px] animate-pulse" />
              ))
            : products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={{
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    image: product.image,
                    calories: product.calories,
                    proteins: product.proteins,
                  }}
                />
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
