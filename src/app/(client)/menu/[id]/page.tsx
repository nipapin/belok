"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import ProductOptions from '@/components/product/ProductOptions';
import { optionCustomizations, resolveVariant } from '@/lib/productOptions';
import ProductGallery from "@/components/product/ProductGallery";
import { SpicinessBadge } from "@/components/product/SpicinessBadge";
import { formatVariantTitle } from "@/lib/productTitle";
import { useCartStore } from "@/store/cartStore";
import { Product } from "@/types";
import { isNewProduct } from "@/lib/productFlags";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const addItem = useCartStore((s) => s.addItem);
  const requestedVariantId = searchParams.get("v");
  const [variantPick, setVariantPick] = useState<{ productId: string; index: number } | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [removedIngredients, setRemovedIngredients] = useState<Set<string>>(new Set());
  const [addedExtras, setAddedExtras] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetch(`/api/products/${id}`).then((r) => r.json()),
  });

  const product: Product | undefined = data?.product;

  const getCustomizations = () => product ? optionCustomizations(product.ingredients, removedIngredients, addedExtras) : [];
  const calcPrice = () => product ? Math.round((resolveVariant(product, selectedVariant).price + getCustomizations().reduce((sum, choice) => sum + choice.priceDelta, 0)) * quantity * 100) / 100 : 0;

  const variants = product?.variants ?? [];
  const requestedIndex = requestedVariantId
    ? variants.findIndex((variant) => variant.id === requestedVariantId)
    : -1;
  const variantIndex =
    product && variantPick?.productId === product.id
      ? variantPick.index
      : requestedIndex >= 0
        ? requestedIndex
        : 0;
  const safeVariantIndex = variants.length === 0 ? 0 : Math.min(variantIndex, variants.length - 1);
  const selectedVariant = variants[safeVariantIndex] ?? null;

  const handleAddToCart = () => {
    if (!product) return;
    addItem({
      productId: product.id,
      variantId: selectedVariant?.id ?? null,
      variantName: selectedVariant?.name ?? null,
      name: formatVariantTitle(product.name, selectedVariant?.name),
      image: selectedVariant?.image || product.image,
      basePrice: resolveVariant(product, selectedVariant).price,
      quantity,
      customizations: getCustomizations(),
    });
    router.push("/cart");
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg px-2 pb-28">
        <div className="relative -mx-4 -mt-(--client-header-stack-height)">
          <div className="glass-tight mb-4 h-[250px] animate-pulse border-0" />
        </div>
        <div className="h-8 w-[60%] max-w-xs animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--lg-fill)_70%,transparent)]" />
        <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-[color-mix(in_srgb,var(--lg-fill)_50%,transparent)]" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-lg px-2 py-16 text-center">
        <p className="text-lg font-semibold text-[var(--lg-text)]">Товар не найден</p>
        <button type="button" className="btn-primary mt-4" onClick={() => router.push("/menu")}>
          Вернуться в меню
        </button>
      </div>
    );
  }

  const display = resolveVariant(product, selectedVariant);
  const slides =
    variants.length > 0
      ? variants.map((variant) => ({
          key: variant.id,
          image: variant.image || product.image,
          alt: formatVariantTitle(product.name, variant.name),
          fallback: variant.name[0] || product.name[0],
        }))
      : [
          {
            key: product.id,
            image: product.image,
            alt: product.name,
            fallback: product.name[0],
          },
        ];

  return (
    <div className="">
      <div className="relative -mx-4 -mt-(--client-header-stack-height)">
        <ProductGallery
          slides={slides}
          index={safeVariantIndex}
          onIndex={(next) => setVariantPick({ productId: product.id, index: next })}
        />
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-icon absolute left-4 bottom-4 z-1200 glass-fx"
          aria-label="Назад"
        >
          <ArrowLeft className="size-5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="mx-auto max-w-lg pt-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-block rounded-full border border-[var(--lg-ring)] bg-[color-mix(in_srgb,var(--lg-fill)_90%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--lg-text-muted)] backdrop-blur-md">
                {product.category.name}
              </span>
              {isNewProduct(product.createdAt) ? (
                <span className="inline-block rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                  Новинка
                </span>
              ) : null}
              <SpicinessBadge level={product.spicinessLevel} />
            </div>
            <h1 className="heading-section text-balance">{product.name}</h1>
            {selectedVariant ? (
              <p className="mt-1 text-base font-semibold text-[var(--lg-text)]">{selectedVariant.name}</p>
            ) : null}
            {display.weightGrams != null ? (
              <p className="mt-1 text-sm font-medium tabular-nums text-[var(--lg-text-muted)]">
                {display.weightGrams} г
              </p>
            ) : null}
          </div>
          <p className="shrink-0 text-xl font-bold tracking-tight tabular-nums text-[var(--lg-text)]">
            {display.price} ₽
          </p>
        </div>

        {display.volumeMl != null ? <p className="mb-3 text-sm font-medium">{display.volumeMl} мл</p> : null}
        {product.description && (
          <p className="mb-4 text-sm leading-relaxed text-[var(--lg-text-muted)]">{product.description}</p>
        )}

        {([display.weightGrams, display.calories, display.proteins, display.fats, display.carbs, display.fiber] as (number | null)[]).some(
          (v) => v != null,
        ) && (
          <div className="mb-6 grid grid-cols-6 gap-1">
            {[
              { label: "Вес, г", value: display.weightGrams, span: "col-span-2" },
              { label: "Ккал", value: display.calories, span: "col-span-2" },
              { label: "Белки, г", value: display.proteins, span: "col-span-2" },
              { label: "Жиры, г", value: display.fats, span: "col-span-2" },
              { label: "Углеводы, г", value: display.carbs, span: "col-span-2" },
              { label: "Клетчатка, г", value: display.fiber, span: "col-span-2" },
            ]
              .filter((item) => item.value != null)
              .map((item) => (
              <div key={item.label} className={`glass-tight text-center flex items-baseline justify-center gap-1 ${item.span} p-2`}>
                <p className="text-base font-bold text-[var(--lg-text)]">{item.value ?? "—"}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--lg-text-muted)]">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        )}

        <ProductOptions links={product.ingredients} removed={removedIngredients} added={addedExtras} onRemoved={setRemovedIngredients} onAdded={setAddedExtras} />

        <div className="glass-panel-strong p-2 sticky bottom-0 left-0 right-0 flex items-center justify-between">
          <button type="button" className="btn-primary" onClick={handleAddToCart}>
            В корзину · {calcPrice()} ₽
          </button>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className="btn-icon"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              aria-label="Меньше"
            >
              <Minus className="size-4" />
            </button>
            <span className="min-w-10 text-center text-xl font-bold tabular-nums text-[var(--lg-text)]">
              {quantity}
            </span>
            <button type="button" className="btn-icon" onClick={() => setQuantity(Math.min(100, quantity + 1))} aria-label="Больше">
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
