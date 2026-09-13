'use client';

import { create } from 'zustand';
import type { CartItem, CartItemCustomization } from '@/store/cartStore';

export type { CartItem, CartItemCustomization };

function customizationKey(customizations: CartItemCustomization[]): string {
  return customizations
    .map((c) => `${c.action}:${c.ingredientId}:${c.priceDelta}`)
    .sort()
    .join('|');
}

function isSameLine(
  a: Pick<CartItem, 'productId' | 'customizations'>,
  b: Pick<CartItem, 'productId' | 'customizations'>
): boolean {
  return a.productId === b.productId && customizationKey(a.customizations) === customizationKey(b.customizations);
}

interface KioskCartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  getItemPrice: (item: CartItem) => number;
  getPlainLineQuantity: (productId: string) => number;
  getPlainLineId: (productId: string) => string | null;
}

export const useKioskCartStore = create<KioskCartState>()((set, get) => ({
  items: [],

  addItem: (item) => {
    set((state) => {
      const existing = state.items.find((i) => isSameLine(i, item));
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === existing.id ? { ...i, quantity: i.quantity + item.quantity } : i
          ),
        };
      }
      const id = `${item.productId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      return { items: [...state.items, { ...item, id }] };
    });
  },

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),

  updateQuantity: (id, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((item) => item.id !== id)
          : state.items.map((item) => (item.id === id ? { ...item, quantity } : item)),
    })),

  clearCart: () => set({ items: [] }),

  getTotalItems: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

  getItemPrice: (item) => {
    const extras = item.customizations.reduce((sum, c) => sum + c.priceDelta, 0);
    return (item.basePrice + extras) * item.quantity;
  },

  getTotalPrice: () => {
    const { items, getItemPrice } = get();
    return items.reduce((sum, item) => sum + getItemPrice(item), 0);
  },

  getPlainLineQuantity: (productId) => {
    return get()
      .items.filter((i) => i.productId === productId && i.customizations.length === 0)
      .reduce((sum, i) => sum + i.quantity, 0);
  },

  getPlainLineId: (productId) => {
    const line = get().items.find((i) => i.productId === productId && i.customizations.length === 0);
    return line?.id ?? null;
  },
}));
