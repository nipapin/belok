'use client';

import { useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Check, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCartStore } from '@/store/cartStore';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    searchParams.get('category')
  );
  const addItem = useCartStore((s) => s.addItem);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function handleAdd(product: Product) {
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      basePrice: product.price,
      quantity: 1,
      customizations: [],
    });
    setJustAdded((prev) => {
      const next = new Set(prev);
      next.add(product.id);
      return next;
    });
    const prev = flashTimers.current.get(product.id);
    if (prev) clearTimeout(prev);
    flashTimers.current.set(
      product.id,
      setTimeout(() => {
        setJustAdded((s) => {
          const next = new Set(s);
          next.delete(product.id);
          return next;
        });
        flashTimers.current.delete(product.id);
      }, 700),
    );
  }

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
    `shrink-0 px-4 py-2 text-sm font-semibold transition lg-chip lg-pill lg-interactive ${active ? "lg-active" : ""}`;

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
          : filteredProducts.map((product) => {
              const added = justAdded.has(product.id);
              return (
                <div key={product.id} className="relative h-full">
                  <button
                    type="button"
                    onClick={() => router.push(`/menu/${product.id}`)}
                    className="glass-panel lg-interactive group flex h-full w-full cursor-pointer flex-col overflow-hidden text-left"
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
                      <p className="mb-1 line-clamp-2 min-h-[2.6rem] text-sm font-semibold leading-snug text-[var(--lg-text)]">
                        {product.name}
                      </p>
                      {product.calories != null && (
                        <p className="text-xs text-[var(--lg-text-muted)]">
                          {product.calories} ккал
                          {product.proteins != null && (
                            <span>
                              {' '}
                              · Б {product.proteins} г
                            </span>
                          )}
                        </p>
                      )}
                      <p className="mt-auto pt-1 pr-12 text-base font-bold text-[var(--lg-text)]">{product.price} ₽</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdd(product)}
                    aria-label={`Добавить ${product.name} в корзину`}
                    aria-pressed={added}
                    className={`lg-interactive absolute right-2 bottom-2 inline-flex size-9 items-center justify-center rounded-full border backdrop-blur-md transition ${
                      added
                        ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-50'
                        : 'border-[var(--lg-ring)] bg-[var(--lg-fill)] text-[var(--lg-text)]'
                    }`}
                  >
                    {added ? (
                      <Check className="size-[18px]" strokeWidth={2.5} />
                    ) : (
                      <Plus className="size-[18px]" strokeWidth={2.25} />
                    )}
                  </button>
                </div>
              );
            })}
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
