'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItemCustomization {
  ingredientId: string;
  ingredientName: string;
  action: 'ADD' | 'REMOVE';
  priceDelta: number;
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  image: string | null;
  basePrice: number;
  quantity: number;
  customizations: CartItemCustomization[];
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  getItemPrice: (item: CartItem) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const id = `${item.productId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({
          items: [...state.items, { ...item, id }],
        }));
      },

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      updateQuantity: (id, quantity) =>
        set((state) => ({
          items: quantity <= 0
            ? state.items.filter((item) => item.id !== id)
            : state.items.map((item) =>
                item.id === id ? { ...item, quantity } : item
              ),
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
    }),
    {
      name: 'belok-cart',
    }
  )
);
