"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { useFavoritesStore } from "@/store/favoritesStore";
import { useHaptic } from "@/hooks/useHaptic";
import { useHydrated } from "@/hooks/useHydrated";
import { FoodCard, type FoodCardModel } from "./FoodCard";

export type ProductCardModel = FoodCardModel;

type ProductCardProps = {
  product: ProductCardModel;
  eager?: boolean;
};

export function ProductCard({ product, eager = false }: ProductCardProps) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const quantity = useCartStore((s) => s.getPlainLineQuantity(product.id));
  const plainLineId = useCartStore((s) => s.getPlainLineId(product.id));
  const favorite = useFavoritesStore((s) => s.ids.includes(product.id));
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const hydrated = useHydrated();
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

  function handleToggleFavorite(e: React.MouseEvent) {
    e.stopPropagation();
    toggleFavorite(product.id);
    haptic("selection");
  }

  return (
    <FoodCard
      product={product}
      quantity={quantity}
      busy={busy}
      favorite={hydrated && favorite}
      eager={eager}
      onOpen={() => router.push(`/menu/${product.id}`)}
      onAdd={handleAdd}
      onIncrement={handleIncrement}
      onDecrement={handleDecrement}
      onToggleFavorite={handleToggleFavorite}
    />
  );
}
