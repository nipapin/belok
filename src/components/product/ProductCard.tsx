"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { useHaptic } from "@/hooks/useHaptic";
import { formatVariantTitle } from "@/lib/productTitle";
import { FoodCard, type FoodCardModel } from "./FoodCard";

export type ProductCardModel = FoodCardModel;

type ProductCardProps = {
  product: ProductCardModel;
  eager?: boolean;
};

function variantSignature(product: ProductCardModel) {
  return (product.variants ?? []).map((variant) => `${variant.id}:${variant.name}:${variant.image ?? ""}`).join("|");
}

function sameProductCard(prev: ProductCardProps, next: ProductCardProps) {
  const a = prev.product;
  const b = next.product;
  return (
    prev.eager === next.eager &&
    a.id === b.id &&
    a.image === b.image &&
    a.name === b.name &&
    a.price === b.price &&
    a.calories === b.calories &&
    a.proteins === b.proteins &&
    a.fats === b.fats &&
    a.carbs === b.carbs &&
    a.weightGrams === b.weightGrams &&
    a.spicinessLevel === b.spicinessLevel &&
    a.categoryName === b.categoryName &&
    a.createdAt === b.createdAt &&
    variantSignature(a) === variantSignature(b)
  );
}

export const ProductCard = memo(function ProductCard({ product, eager = false }: ProductCardProps) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const variants = product.variants ?? [];
  const [index, setIndex] = useState(0);
  const safeIndex = variants.length === 0 ? 0 : index % variants.length;
  const active = variants[safeIndex] ?? null;
  const quantity = useCartStore((s) => s.getPlainLineQuantity(product.id, active?.id ?? null));
  const plainLineId = useCartStore((s) => s.getPlainLineId(product.id, active?.id ?? null));
  const haptic = useHaptic();
  const [busy, setBusy] = useState(false);
  const busyTimer = useRef<number | undefined>(undefined);
  const choosable = variants.length > 1;
  const image = active?.image || product.image;
  const flavor = active?.name ?? null;

  useEffect(() => () => window.clearTimeout(busyTimer.current), []);

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    addItem({
      productId: product.id,
      variantId: active?.id ?? null,
      variantName: active?.name ?? null,
      name: formatVariantTitle(product.name, active?.name),
      image,
      basePrice: product.price,
      quantity: 1,
      customizations: [],
    });
    haptic("success");
    window.clearTimeout(busyTimer.current);
    busyTimer.current = window.setTimeout(() => setBusy(false), 200);
  }

  function handleIncrement(e: React.MouseEvent) {
    e.stopPropagation();
    if (plainLineId) {
      updateQuantity(plainLineId, quantity + 1);
      haptic("light");
    } else {
      handleAdd(e);
    }
  }

  function handleDecrement(e: React.MouseEvent) {
    e.stopPropagation();
    if (!plainLineId) return;
    if (quantity <= 1) {
      removeItem(plainLineId);
      haptic("medium");
    } else {
      updateQuantity(plainLineId, quantity - 1);
      haptic("light");
    }
  }

  return (
    <FoodCard
      product={{ ...product, image }}
      flavor={flavor}
      quantity={quantity}
      busy={busy}
      eager={eager}
      onOpen={() => {
        const query = active ? `?v=${encodeURIComponent(active.id)}` : "";
        router.push(`/menu/${product.id}${query}`);
      }}
      onAdd={handleAdd}
      onIncrement={handleIncrement}
      onDecrement={handleDecrement}
      onPrevFlavor={
        choosable
          ? () => setIndex((current) => (current - 1 + variants.length) % variants.length)
          : undefined
      }
      onNextFlavor={
        choosable ? () => setIndex((current) => (current + 1) % variants.length) : undefined
      }
    />
  );
}, sameProductCard);
