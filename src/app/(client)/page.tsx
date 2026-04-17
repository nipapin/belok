'use client';

import { ArrowRight, Flame } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { brandMark } from '@/lib/brand';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  calories: number | null;
  proteins: number | null;
  category: { name: string };
}

interface Category {
  id: string;
  name: string;
  image: string | null;
  _count: { products: number };
}

export default function HomePage() {
  const router = useRouter();
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetch('/api/products').then((r) => r.json()),
  });

  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/products/categories').then((r) => r.json()),
  });

  const products: Product[] = productsData?.products?.slice(0, 4) ?? [];
  const categories: Category[] = categoriesData?.categories ?? [];

  return (
    <div className="pt-2">
      <section className="glass-panel mb-6 px-5 py-8 text-center sm:py-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
          кафе здорового питания
        </p>
        <h1 className="heading-display mb-3 lowercase text-zinc-900">{brandMark}</h1>
        <p className="mx-auto mb-6 max-w-md text-base leading-relaxed text-zinc-600">
          Свежие боулы, смузи и салаты каждый день — закажите то, что подходит именно вам.
        </p>
        <button type="button" className="btn-primary px-8" onClick={() => router.push('/menu')}>
          Смотреть меню
          <ArrowRight className="size-4" strokeWidth={2} />
        </button>
      </section>

      <div className="mx-auto max-w-2xl">
        <h2 className="heading-section mb-3">Категории</h2>
        <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
          {loadingCategories
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-11 w-[120px] shrink-0 animate-pulse rounded-full bg-white/40"
                />
              ))
            : categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => router.push(`/menu?category=${cat.id}`)}
                  className="shrink-0 rounded-full border border-white/50 bg-white/55 px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm backdrop-blur-md transition hover:bg-white/75"
                >
                  {cat.name}{' '}
                  <span className="text-zinc-500">({cat._count.products})</span>
                </button>
              ))}
        </div>

        <div className="mb-3 flex items-center gap-2">
          <Flame className="size-6 text-rose-500" strokeWidth={1.75} />
          <h2 className="heading-section m-0">Популярное</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {loadingProducts
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-tight h-[220px] animate-pulse" />
              ))
            : products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => router.push(`/menu/${product.id}`)}
                  className="glass-panel group flex cursor-pointer flex-col overflow-hidden text-left transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="relative flex h-[140px] items-center justify-center bg-zinc-100/80">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl font-bold text-zinc-300">{product.name[0]}</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="truncate text-sm font-semibold text-zinc-900">{product.name}</p>
                    {product.calories != null && (
                      <p className="text-xs text-zinc-500">{product.calories} ккал</p>
                    )}
                    <p className="mt-auto pt-1 text-sm font-bold text-zinc-900">{product.price} ₽</p>
                  </div>
                </button>
              ))}
        </div>

        <div className="mt-8 mb-4 text-center">
          <button type="button" className="btn-outline px-8" onClick={() => router.push('/menu')}>
            Всё меню
            <ArrowRight className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
