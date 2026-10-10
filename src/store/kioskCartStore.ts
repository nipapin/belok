'use client';

import { create } from 'zustand';
import { isSameCartLine, type CartItem, type CartItemCustomization } from '@/store/cartStore';

export type { CartItem, CartItemCustomization };

function isPlainLine(item: CartItem, productId: string, variantId?: string | null): boolean {
  return (
    item.productId === productId &&
    (item.variantId ?? null) === (variantId ?? null) &&
    item.customizations.length === 0
  );
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
  getPlainLineQuantity: (productId: string, variantId?: string | null) => number;
  getPlainLineId: (productId: string, variantId?: string | null) => string | null;
}

export const useKioskCartStore = create<KioskCartState>()((set, get) => ({
  items: [],

  addItem: (item) => {
    set((state) => {
      const existing = state.items.find((i) => isSameCartLine(i, item));
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
    return Math.round((item.basePrice + extras) * 100) * item.quantity / 100;
  },

  getTotalPrice: () => {
    const { items, getItemPrice } = get();
    return Math.round(items.reduce((sum, item) => sum + getItemPrice(item), 0) * 100) / 100;
  },

  getPlainLineQuantity: (productId, variantId) => {
    return get()
      .items.filter((item) => isPlainLine(item, productId, variantId))
      .reduce((sum, item) => sum + item.quantity, 0);
  },

  getPlainLineId: (productId, variantId) => {
    const line = get().items.find((item) => isPlainLine(item, productId, variantId));
    return line?.id ?? null;
  },
}));
