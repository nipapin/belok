"use client";

import { ProductCard } from "@/components/product/ProductCard";
import CategoryChipStrip from "@/components/ui/CategoryChipStrip";
import { useAuthStore } from "@/store/authStore";
import { Category, Product } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Flame } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function HomePageInner() {
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
    <div className="py-4">
      <div className="mb-3 flex items-center gap-2">
        <Flame className="size-6 opacity-85 text-(--lg-text)" strokeWidth={1.75} />
        <h2 className="heading-section m-0">Популярное</h2>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2">
        {loadingProducts
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-tight w-full h-full aspect-2/3 animate-pulse" />
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
    </div>
  );
}
