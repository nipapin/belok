"use client";

import { ProductCard } from "@/components/product/ProductCard";
import { FoodCardSkeleton } from "@/components/product/FoodCard";
import { Category, Product } from "@/types";
import {
  type CategoriesHomeBlock,
  type ContactsHomeBlock,
  type GalleryHomeBlock,
  type HomeBlock,
  type HomeLayoutConfig,
  type ProductsHomeBlock,
  type TextHomeBlock,
} from "@/lib/homeLayout";
import { useQuery } from "@tanstack/react-query";
import { Clock, MapPin, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useAuthStore } from "@/store/authStore";

const productCarouselClass = "product-carousel";
const productSlideClass =
  "flex w-[min(72vw,280px)] min-w-[220px] shrink-0 snap-start sm:w-[240px]";

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "#";
}

function mapHref(block: ContactsHomeBlock): string | null {
  if (block.mapUrl.trim()) return block.mapUrl.trim();
  if (block.address.trim()) {
    return `https://yandex.ru/maps/?text=${encodeURIComponent(block.address.trim())}`;
  }
  return null;
}

function TextBlockView({ block }: { block: TextHomeBlock }) {
  return (
    <section className="mb-6">
      {block.title ? <h2 className="heading-section mb-2">{block.title}</h2> : null}
      {block.text ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-(--lg-text) opacity-90">
          {block.text}
        </p>
      ) : null}
    </section>
  );
}

function GalleryBlockView({ block }: { block: GalleryHomeBlock }) {
  return (
    <section className="mb-6">
      {block.title ? <h2 className="heading-section mb-2">{block.title}</h2> : null}
      {block.text ? (
        <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-(--lg-text) opacity-90">
          {block.text}
        </p>
      ) : null}
      {block.images.length > 0 ? (
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide pb-1">
          {block.images.map((src, index) => (
            <div
              key={`${src}-${index}`}
              className="h-44 w-[78%] shrink-0 snap-start overflow-hidden rounded-2xl sm:w-64"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-cover" loading={index === 0 ? "eager" : "lazy"} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProductsBlockView({
  block,
  products,
  hitIds,
  loading,
}: {
  block: ProductsHomeBlock;
  products: Product[];
  hitIds: string[];
  loading: boolean;
}) {
  const list = useMemo(() => {
    if (block.mode === "picked" && block.productIds.length > 0) {
      const map = new Map(products.map((p) => [p.id, p]));
      return block.productIds
        .map((id) => map.get(id))
        .filter((p): p is Product => Boolean(p))
        .slice(0, block.limit);
    }
    if (block.mode === "hits") {
      const map = new Map(products.map((p) => [p.id, p]));
      const sourceIds = hitIds.length > 0 ? hitIds : block.productIds;
      const ordered = sourceIds
        .map((id) => map.get(id))
        .filter((p): p is Product => Boolean(p));
      return ordered.slice(0, block.limit);
    }
    return products.slice(0, block.limit);
  }, [block, products, hitIds]);

  const cards = loading
    ? Array.from({ length: Math.min(block.limit, 4) }).map((_, i) => (
        <div
          key={i}
          className={block.layout === "carousel" ? productSlideClass : "w-full"}
        >
          <FoodCardSkeleton />
        </div>
      ))
    : list.map((product, index) => {
        const card = (
          <ProductCard
            key={product.id}
            eager={index < 4}
            product={{
              id: product.id,
              name: product.name,
              price: product.price,
              image: product.image,
              calories: product.calories,
              proteins: product.proteins,
              weightGrams: product.weightGrams,
              categoryName: product.category?.name,
              createdAt: product.createdAt,
            }}
          />
        );
        return block.layout === "carousel" ? (
          <div key={product.id} className={productSlideClass}>
            {card}
          </div>
        ) : (
          card
        );
      });

  return (
    <section className="mb-6">
      {block.title ? <h2 className="heading-section mb-3">{block.title}</h2> : null}
      {block.layout === "carousel" ? (
        <div className={productCarouselClass}>{cards}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">{cards}</div>
      )}
    </section>
  );
}

function CategoriesBlockView({
  block,
  categories,
  loading,
}: {
  block: CategoriesHomeBlock;
  categories: Category[];
  loading: boolean;
}) {
  const router = useRouter();

  return (
    <section className="mb-6">
      {block.title ? <h2 className="heading-section mb-3">{block.title}</h2> : null}
      <div className="-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide px-4 py-1">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 w-24 shrink-0 animate-pulse rounded-full glass-fx" />
            ))
          : categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="glass-fx shrink-0 rounded-full px-4 py-2 text-sm whitespace-nowrap"
                onClick={() => router.push(`/menu?category=${category.id}`)}
              >
                {category.name}
              </button>
            ))}
      </div>
    </section>
  );
}

function ContactsBlockView({ block }: { block: ContactsHomeBlock }) {
  const href = mapHref(block);
  const hasAny = Boolean(block.phone || block.address || block.hours);
  if (!hasAny) {
    return (
      <section className="mb-6">
        {block.title ? <h2 className="heading-section mb-2">{block.title}</h2> : null}
        <p className="text-sm text-(--lg-text-muted)">
          Укажите телефон и адрес в админке → Главная.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-6">
      {block.title ? <h2 className="heading-section mb-3">{block.title}</h2> : null}
      <div className="glass-panel space-y-3 p-4">
        {block.phone ? (
          <a
            href={telHref(block.phone)}
            className="flex items-center gap-3 text-sm font-medium text-(--lg-text)"
          >
            <Phone className="size-4 shrink-0 opacity-80" strokeWidth={1.75} />
            {block.phone}
          </a>
        ) : null}
        {block.address ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 text-sm text-(--lg-text)"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 opacity-80" strokeWidth={1.75} />
              <span>{block.address}</span>
            </a>
          ) : (
            <div className="flex items-start gap-3 text-sm text-(--lg-text)">
              <MapPin className="mt-0.5 size-4 shrink-0 opacity-80" strokeWidth={1.75} />
              <span>{block.address}</span>
            </div>
          )
        ) : null}
        {block.hours ? (
          <div className="flex items-start gap-3 text-sm text-(--lg-text-muted)">
            <Clock className="mt-0.5 size-4 shrink-0 opacity-80" strokeWidth={1.75} />
            <span className="whitespace-pre-wrap">{block.hours}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HomeBlockView({
  block,
  products,
  categories,
  hitIds,
  loadingProducts,
  loadingCategories,
}: {
  block: HomeBlock;
  products: Product[];
  categories: Category[];
  hitIds: string[];
  loadingProducts: boolean;
  loadingCategories: boolean;
}) {
  switch (block.type) {
    case "text":
      return <TextBlockView block={block} />;
    case "gallery":
      return <GalleryBlockView block={block} />;
    case "products":
      return (
        <ProductsBlockView
          block={block}
          products={products}
          hitIds={hitIds}
          loading={loadingProducts}
        />
      );
    case "categories":
      return (
        <CategoriesBlockView
          block={block}
          categories={categories}
          loading={loadingCategories}
        />
      );
    case "contacts":
      return <ContactsBlockView block={block} />;
  }
}

export function HomePageInner() {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const { data: layoutData, isLoading: loadingLayout } = useQuery({
    queryKey: ["home-layout"],
    queryFn: () => fetch("/api/home-layout").then((r) => r.json()),
  });

  const config = (layoutData?.config as HomeLayoutConfig | undefined) ?? null;
  const enabledBlocks = useMemo(
    () => (config?.blocks ?? []).filter((b) => b.enabled),
    [config]
  );

  const needsProducts = enabledBlocks.some((b) => b.type === "products");
  const needsCategories = enabledBlocks.some((b) => b.type === "categories");
  const needsHits = enabledBlocks.some((b) => b.type === "products" && b.mode === "hits");

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
    enabled: needsProducts,
  });

  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetch("/api/products/categories").then((r) => r.json()),
    enabled: needsCategories,
  });

  const { data: hitsData } = useQuery({
    queryKey: ["hits"],
    queryFn: () => fetch("/api/hits").then((r) => r.json()),
    enabled: needsHits,
  });
  const hitIds: string[] = hitsData?.productIds ?? [];

  const products: Product[] = productsData?.products ?? [];
  const categories: Category[] = categoriesData?.categories ?? [];

  if (loadingLayout) {
    return (
      <div className="space-y-4 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-tight h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  if (enabledBlocks.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-(--lg-text-muted)">
        На главной пока нет блоков. Добавьте их в админке → Главная.
      </div>
    );
  }

  return (
    <div className="py-4">
      {enabledBlocks.map((block) => (
        <HomeBlockView
          key={block.id}
          block={block}
          products={products}
          categories={categories}
          hitIds={hitIds}
          loadingProducts={loadingProducts}
          loadingCategories={loadingCategories}
        />
      ))}
    </div>
  );
}
