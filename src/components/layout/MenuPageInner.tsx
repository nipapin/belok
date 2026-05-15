"use client";

import { ProductCard } from "@/components/product/ProductCard";
import CategoryChipStrip from "@/components/ui/CategoryChipStrip";
import { Category, Product } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

export function MenuPageInner() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: categoriesData, isLoading: loadingCats } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetch("/api/products/categories").then((r) => r.json()),
  });

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });

  const categories: Category[] = categoriesData?.categories ?? [];
  const allProducts: Product[] = productsData?.products ?? [];

  const productsByCategory = useMemo(() => {
    const grouped = new Map<string, Product[]>();
    for (const product of allProducts) {
      const bucket = grouped.get(product.categoryId);
      if (bucket) bucket.push(product);
      else grouped.set(product.categoryId, [product]);
    }
    return grouped;
  }, [allProducts]);

  const uncategorizedProducts = useMemo(
    () => allProducts.filter((product) => !categories.some((category) => category.id === product.categoryId)),
    [allProducts, categories],
  );

  const categoriesWithProducts = useMemo(
    () => categories.filter((category) => (productsByCategory.get(category.id)?.length ?? 0) > 0),
    [categories, productsByCategory],
  );

  function handleCategorySelect(id: string | null) {
    setSelectedCategory(id);
    if (!id) return;
    const section = document.getElementById(`category-${id}`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (loadingProducts || categoriesWithProducts.length === 0) return;

    const visibleRatios = new Map<string, number>();
    const sectionElements = categoriesWithProducts
      .map((category) => ({
        id: category.id,
        el: document.getElementById(`category-${category.id}`),
      }))
      .filter((entry): entry is { id: string; el: HTMLElement } => Boolean(entry.el));

    if (sectionElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace("category-", "");
          visibleRatios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let nextId: string | null = null;
        let bestRatio = 0;
        for (const category of categoriesWithProducts) {
          const ratio = visibleRatios.get(category.id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            nextId = category.id;
          }
        }

        if (nextId && nextId !== selectedCategory) {
          setSelectedCategory(nextId);
        }
      },
      {
        threshold: [0.15, 0.3, 0.5, 0.75],
        rootMargin: "-120px 0px -45% 0px",
      },
    );

    for (const { el } of sectionElements) observer.observe(el);

    return () => observer.disconnect();
  }, [categoriesWithProducts, loadingProducts, selectedCategory]);

  return (
    <div>
      <div className="sticky top-0 z-30">
        <CategoryChipStrip
          categories={categoriesWithProducts}
          loading={loadingCats}
          selectedId={selectedCategory}
          onSelect={handleCategorySelect}
        />
      </div>

      {loadingProducts ? (
        <div className="grid grid-cols-2 gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-tight w-full h-full aspect-2/3 animate-pulse" />
          ))}
        </div>
      ) : null}

      {!loadingProducts &&
        categoriesWithProducts.map((category, categoryIndex) => {
          const categoryProducts = productsByCategory.get(category.id) ?? [];

          return (
            <section key={category.id} id={`category-${category.id}`} className="mb-6 scroll-mt-24">
              <h2 className="heading-section mb-3">{category.name}</h2>
              <div className="grid grid-cols-2 gap-1">
                {categoryProducts.map((product, productIndex) => (
                  <ProductCard
                    key={product.id}
                    eager={categoryIndex === 0 && productIndex < 2}
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
            </section>
          );
        })}

      {!loadingProducts && uncategorizedProducts.length > 0 && (
        <section id="category-other" className="mb-6 scroll-mt-24">
          <h2 className="heading-section mb-3">Другое</h2>
          <div className="grid grid-cols-2 gap-1">
            {uncategorizedProducts.map((product) => (
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
        </section>
      )}
    </div>
  );
}
