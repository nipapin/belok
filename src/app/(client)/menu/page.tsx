'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ProductCard } from '@/components/product/ProductCard';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  calories: number | null;
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  categoryId: string;
  category: { id: string; name: string };
}

interface Category {
  id: string;
  name: string;
  _count: { products: number };
}

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-[var(--lg-text-muted)]">Загрузка…</div>}>
      <MenuPageInner />
    </Suspense>
  );
}

function MenuPageInner() {
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    searchParams.get('category')
  );

  const { data: categoriesData, isLoading: loadingCats } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/products/categories').then((r) => r.json()),
  });

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetch('/api/products').then((r) => r.json()),
  });

  const categories: Category[] = categoriesData?.categories ?? [];
  const allProducts: Product[] = productsData?.products ?? [];

  const filteredProducts = allProducts.filter(
    (p) => !selectedCategory || p.categoryId === selectedCategory,
  );

  const chip = (active: boolean) =>
    `shrink-0 px-4 py-2 text-sm font-semibold transition lg-chip lg-pill lg-interactive ${active ? 'lg-active' : ''}`;

  return (
    <div className="mx-auto max-w-2xl pb-4 pt-4 px-4">
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto scrollbar-hide scroll-px-4 px-4 py-2">
        <button type="button" className={chip(!selectedCategory)} onClick={() => setSelectedCategory(null)}>
          Все
        </button>
        {loadingCats
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-(--lg-fill)" />
            ))
          : categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={chip(selectedCategory === cat.id)}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </button>
            ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {loadingProducts
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-tight h-[240px] animate-pulse" />
            ))
          : filteredProducts.map((product) => (
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

      {!loadingProducts && filteredProducts.length === 0 && (
        <div className="glass-panel mt-8 py-12 text-center">
          <p className="text-lg font-semibold text-[var(--lg-text)]">В этой категории пока пусто</p>
          <p className="mt-2 text-sm text-[var(--lg-text-muted)]">Выберите другую категорию</p>
        </div>
      )}
    </div>
  );
}
