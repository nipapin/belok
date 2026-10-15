'use client';

import { useState } from 'react';
import ToppingsDialog from '@/components/product/ToppingsDialog';
import { toppingOptions, type ToppingProduct } from '@/lib/toppings';
import type { CartItem } from '@/store/cartStore';

type CartDraft = Omit<CartItem, 'id'>;
export function useToppingCart(toppings: ToppingProduct[] | undefined, addItem: (item: CartDraft) => void, onAdded?: () => void) {
  const [pending, setPending] = useState<{ item: CartDraft; toppings: ToppingProduct[] } | null>(null);
  function commit(items: CartDraft[]) {
    for (const item of items) addItem(item);
    setPending(null);
    onAdded?.();
  }
  return {
    hasToppings: toppingOptions(toppings).length > 0,
    addWithToppings: (item: CartDraft) => {
      if (toppingOptions(toppings).length) setPending({ item, toppings: toppings! });
      else commit([item]);
    },
    toppingDialog: pending ? <ToppingsDialog item={pending.item} toppings={pending.toppings} onConfirm={commit} onClose={() => setPending(null)} /> : null,
  };
}
