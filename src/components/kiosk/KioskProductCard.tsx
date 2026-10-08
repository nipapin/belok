'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { FoodCard, type FoodCardModel } from '@/components/product/FoodCard';
import { useHaptic } from '@/hooks/useHaptic';
import { useKioskCartStore } from '@/store/kioskCartStore';

type KioskProductCardProps = {
  product: FoodCardModel;
  eager?: boolean;
  onOpen: () => void;
};

function sameCard(prev: KioskProductCardProps, next: KioskProductCardProps) {
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
    (a.variantId ?? null) === (b.variantId ?? null)
  );
}

export const KioskProductCard = memo(function KioskProductCard({
  product,
  eager = false,
  onOpen,
}: KioskProductCardProps) {
  const addItem = useKioskCartStore((s) => s.addItem);
  const updateQuantity = useKioskCartStore((s) => s.updateQuantity);
  const removeItem = useKioskCartStore((s) => s.removeItem);
  const quantity = useKioskCartStore((s) => s.getPlainLineQuantity(product.id, product.variantId));
  const plainLineId = useKioskCartStore((s) => s.getPlainLineId(product.id, product.variantId));
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
      variantId: product.variantId ?? null,
      name: product.name,
      image: product.image,
      basePrice: product.price,
      quantity: 1,
      customizations: [],
    });
    haptic('success');
    window.clearTimeout(busyTimer.current);
    busyTimer.current = window.setTimeout(() => setBusy(false), 200);
  }

  function handleIncrement(e: React.MouseEvent) {
    e.stopPropagation();
    if (plainLineId) {
      updateQuantity(plainLineId, quantity + 1);
      haptic('light');
    } else {
      handleAdd(e);
    }
  }

  function handleDecrement(e: React.MouseEvent) {
    e.stopPropagation();
    if (!plainLineId) return;
    if (quantity <= 1) {
      removeItem(plainLineId);
      haptic('medium');
    } else {
      updateQuantity(plainLineId, quantity - 1);
      haptic('light');
    }
  }

  return (
    <FoodCard
      product={product}
      quantity={quantity}
      busy={busy}
      eager={eager}
      onOpen={onOpen}
      onAdd={handleAdd}
      onIncrement={handleIncrement}
      onDecrement={handleDecrement}
    />
  );
}, sameCard);
