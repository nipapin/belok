"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { useHaptic } from "@/hooks/useHaptic";
import { FoodCard, type FoodCardModel } from "./FoodCard";

export type ProductCardModel = FoodCardModel;

type ProductCardProps = {
  product: ProductCardModel;
  eager?: boolean;
};

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
    a.categoryName === b.categoryName &&
    a.createdAt === b.createdAt
  );
}

export const ProductCard = memo(function ProductCard({ product, eager = false }: ProductCardProps) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const quantity = useCartStore((s) => s.getPlainLineQuantity(product.id));
  const plainLineId = useCartStore((s) => s.getPlainLineId(product.id));
  const haptic = useHaptic();
  const [busy, setBusy] = useState(false);
  const busyTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(busyTimer.current), []);

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
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
      product={product}
      quantity={quantity}
      busy={busy}
      eager={eager}
      onOpen={() => router.push(`/menu/${product.id}`)}
      onAdd={handleAdd}
      onIncrement={handleIncrement}
      onDecrement={handleDecrement}
    />
  );
}, sameProductCard);
