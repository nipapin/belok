'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

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
    <Suspense fallback={<div className="py-12 text-center text-zinc-500">Загрузка…</div>}>
      <MenuPageInner />
    </Suspense>
  );
}

function MenuPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    searchParams.get('category')
  );
  const [search, setSearch] = useState('');

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

  const filteredProducts = allProducts.filter((p) => {
    const matchesCategory = !selectedCategory || p.categoryId === selectedCategory;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
      active
        ? 'border border-surface-edge-strong bg-zinc-900 text-white shadow-md'
        : 'border border-surface-edge bg-white/50 text-zinc-800 backdrop-blur-md hover:border-surface-edge-strong hover:bg-white/70'
    }`;

  return (
    <div className="mx-auto max-w-2xl pb-4 pt-2">
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-zinc-400"
          strokeWidth={1.75}
        />
        <input
          className="input-pill w-full pl-11"
          placeholder="Поиск по меню…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск по меню"
        />
      </div>

      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
        <button type="button" className={chip(!selectedCategory)} onClick={() => setSelectedCategory(null)}>
          Все
        </button>
        {loadingCats
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-white/40" />
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
              <button
                key={product.id}
                type="button"
                onClick={() => router.push(`/menu/${product.id}`)}
                className="glass-panel group flex cursor-pointer flex-col overflow-hidden text-left transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="relative flex h-[150px] items-center justify-center bg-zinc-100/80">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-5xl font-bold text-zinc-200/80">{product.name[0]}</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="mb-1 line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">
                    {product.name}
                  </p>
                  {product.calories != null && (
                    <p className="text-xs text-zinc-500">
                      {product.calories} ккал
                      {product.proteins != null && (
                        <span>
                          {' '}
                          · Б {product.proteins} г
                        </span>
                      )}
                    </p>
                  )}
                  <p className="mt-auto pt-1 text-base font-bold text-zinc-900">{product.price} ₽</p>
                </div>
              </button>
            ))}
      </div>

      {!loadingProducts && filteredProducts.length === 0 && (
        <div className="glass-panel mt-8 py-12 text-center">
          <p className="text-lg font-semibold text-zinc-700">Ничего не найдено</p>
          <p className="mt-2 text-sm text-zinc-500">Попробуйте изменить поиск или категорию</p>
        </div>
      )}
    </div>
  );
}
