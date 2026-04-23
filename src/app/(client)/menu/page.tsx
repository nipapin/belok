'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ProductCard } from '@/components/product/ProductCard';
import CategoryChipStrip from '@/components/ui/CategoryChipStrip';

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
  fiber: number | null;
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
    <Suspense fallback={<div className="py-12 text-center text-(--lg-text-muted)">Загрузка…</div>}>
      <MenuPageInner />
    </Suspense>
  );
}

function MenuPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryFromUrl = searchParams.get('category');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryFromUrl);

  useEffect(() => {
    setSelectedCategory(categoryFromUrl);
  }, [categoryFromUrl]);

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

  function handleCategorySelect(id: string | null) {
    setSelectedCategory(id);
    if (id) {
      router.replace(`/menu?category=${encodeURIComponent(id)}`);
    } else {
      router.replace('/menu');
    }
  }

  return (
    <div className="pt-2">
      <div className="mx-auto max-w-2xl px-2 pb-4">
        <CategoryChipStrip
          showAllOption
          categories={categories}
          loading={loadingCats}
          selectedId={selectedCategory}
          onSelect={handleCategorySelect}
        />

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
            <p className="text-lg font-semibold text-(--lg-text)">В этой категории пока пусто</p>
            <p className="mt-2 text-sm text-(--lg-text-muted)">Выберите другую категорию</p>
          </div>
        )}
      </div>
    </div>
  );
}
