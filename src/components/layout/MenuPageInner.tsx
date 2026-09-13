"use client";

import { ProductCard } from "@/components/product/ProductCard";
import { FoodCardSkeleton } from "@/components/product/FoodCard";
import CategoryChipStrip from "@/components/ui/CategoryChipStrip";
import { Category, Product } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

const productCarouselClass = "product-carousel";
const productSlideClass =
  "flex w-[min(72vw,280px)] min-w-[220px] shrink-0 snap-start sm:w-[240px]";

export function MenuPageInner() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const selectedCategoryRef = useRef<string | null>(null);
  selectedCategoryRef.current = selectedCategory;
  // While a click-triggered smooth scroll is in flight, the IntersectionObserver
  // must not overwrite the selected chip with intermediate categories.
  const suppressObserverRef = useRef(false);
  const suppressTimerRef = useRef<number | undefined>(undefined);

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
    if (!section) return;
    suppressObserverRef.current = true;
    window.clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = window.setTimeout(() => {
      suppressObserverRef.current = false;
    }, 1200);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => () => window.clearTimeout(suppressTimerRef.current), []);

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
        if (suppressObserverRef.current) return;
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

        if (nextId && nextId !== selectedCategoryRef.current) {
          setSelectedCategory(nextId);
        }
      },
      {
        // Sections are shorter with horizontal carousels — keep more of the
        // viewport in play so the active chip doesn't jump.
        threshold: [0.2, 0.4, 0.6, 0.8],
        rootMargin: "-100px 0px -35% 0px",
      },
    );

    for (const { el } of sectionElements) observer.observe(el);

    return () => observer.disconnect();
  }, [categoriesWithProducts, loadingProducts]);

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
        <div className={productCarouselClass}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={productSlideClass}>
              <FoodCardSkeleton />
            </div>
          ))}
        </div>
      ) : null}

      {!loadingProducts &&
        categoriesWithProducts.map((category, categoryIndex) => {
          const categoryProducts = productsByCategory.get(category.id) ?? [];

          return (
            <section key={category.id} id={`category-${category.id}`} className="mb-6 scroll-mt-24">
              <h2 className="heading-section mb-3">{category.name}</h2>
              <div className={productCarouselClass}>
                {categoryProducts.map((product, productIndex) => (
                  <div key={product.id} className={productSlideClass}>
                    <ProductCard
                      eager={categoryIndex === 0 && productIndex < 2}
                      product={{
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        image: product.image,
                        calories: product.calories,
                        proteins: product.proteins,
                        fats: product.fats,
                        carbs: product.carbs,
                        weightGrams: product.weightGrams,
                        categoryName: category.name,
                        createdAt: product.createdAt,
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}

      {!loadingProducts && uncategorizedProducts.length > 0 && (
        <section id="category-other" className="mb-6 scroll-mt-24">
          <h2 className="heading-section mb-3">Другое</h2>
          <div className={productCarouselClass}>
            {uncategorizedProducts.map((product) => (
              <div key={product.id} className={productSlideClass}>
                <ProductCard
                  product={{
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    image: product.image,
                    calories: product.calories,
                    proteins: product.proteins,
                    fats: product.fats,
                    carbs: product.carbs,
                    weightGrams: product.weightGrams,
                    categoryName: product.category?.name,
                    createdAt: product.createdAt,
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
