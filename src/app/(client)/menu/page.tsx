'use client';

import { useState, Suspense, useEffect, useRef } from 'react';
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
  const allChipRef = useRef<HTMLButtonElement>(null);
  const categoryChipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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

  const chipClass = (active: boolean) =>
    `flex min-h-11 w-28 shrink-0 items-center justify-center wrap-break-word px-1.5 py-2 text-center text-sm font-semibold leading-tight transition line-clamp-2 lg-chip lg-pill lg-interactive ${active ? 'lg-active' : ''}`;

  useEffect(() => {
    if (loadingCats) return;
    const el = !selectedCategory ? allChipRef.current : categoryChipRefs.current.get(selectedCategory);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedCategory, loadingCats]);

  return (
    <div className="mx-auto max-w-2xl px-2 pb-4 pt-4">
      <div className="mb-4 flex gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide scroll-pl-2 scroll-pr-2 py-2">
        <button
          ref={allChipRef}
          type="button"
          className={chipClass(!selectedCategory)}
          onClick={() => setSelectedCategory(null)}
        >
          Все
        </button>
        {loadingCats
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-11 w-28 shrink-0 animate-pulse rounded-full bg-(--lg-fill)" />
            ))
          : categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={chipClass(selectedCategory === cat.id)}
                ref={(node) => {
                  if (node) categoryChipRefs.current.set(cat.id, node);
                  else categoryChipRefs.current.delete(cat.id);
                }}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </button>
            ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2">
        {loadingProducts
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-tight w-full h-full aspect-2/3 animate-pulse" />
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
