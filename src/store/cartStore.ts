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
  toppings?: CartTopping[];
  id: string;
  productId: string;
  variantId?: string | null;
  variantName?: string | null;
  name: string;
  image: string | null;
  basePrice: number;
  quantity: number;
  customizations: CartItemCustomization[];
}

export type CartTopping = Pick<CartItem, 'productId' | 'variantId' | 'variantName' | 'name' | 'image' | 'basePrice'>;

export function cartItemPrice(item: CartItem): number {
  const extras = item.customizations.reduce((sum, choice) => sum + choice.priceDelta, 0);
  const toppings = (item.toppings ?? []).reduce((sum, topping) => sum + topping.basePrice, 0);
  return Math.round((item.basePrice + extras + toppings) * 100) * item.quantity / 100;
}

function toppingKey(item: { toppings?: CartTopping[] }): string {
  return (item.toppings ?? []).map((topping) => JSON.stringify([topping.productId,topping.variantId ?? null,topping.basePrice])).sort().join('|');
}

/** Order-independent fingerprint of a customization set. */
function customizationKey(customizations: CartItemCustomization[]): string {
  return customizations
    .map((c) => `${c.action}:${c.ingredientId}:${c.priceDelta}`)
    .sort()
    .join('|');
}

export function cartVariantId(item: { variantId?: string | null }): string | null {
  return item.variantId ?? null;
}

export function isSameCartLine(
  a: Pick<CartItem, 'productId' | 'variantId' | 'customizations' | 'toppings'>,
  b: Pick<CartItem, 'productId' | 'variantId' | 'customizations' | 'toppings'>
): boolean {
  return (
    a.productId === b.productId &&
    cartVariantId(a) === cartVariantId(b) &&
    customizationKey(a.customizations) === customizationKey(b.customizations) && toppingKey(a) === toppingKey(b)
  );
}

function isPlainLine(item: CartItem, productId: string, variantId?: string | null): boolean {
  return (
    item.productId === productId &&
    cartVariantId(item) === (variantId ?? null) &&
    item.customizations.length === 0 && !item.toppings?.length
  );
}

/** Collapses duplicate lines (same product + same customizations) into one, summing quantities. */
function mergeDuplicateItems(items: CartItem[]): CartItem[] {
  const merged: CartItem[] = [];
  for (const item of items) {
    const existing = merged.find((i) => isSameCartLine(i, item));
    if (existing) existing.quantity += item.quantity;
    else merged.push({ ...item });
  }
  return merged;
}

export function removeCartTopping(items: CartItem[], itemId: string, productId: string, variantId?: string | null): CartItem[] {
  const item = items.find((entry) => entry.id === itemId);
  const toppings = item?.toppings?.filter((topping) => topping.productId !== productId || (topping.variantId ?? null) !== (variantId ?? null));
  if (!item || !toppings || toppings.length === item.toppings?.length) return items;
  return mergeDuplicateItems(items.map((entry) => entry.id === itemId ? { ...entry,toppings } : entry));
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  removeTopping: (itemId: string, productId: string, variantId?: string | null) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  getItemPrice: (item: CartItem) => number;
  /** Quantity of the plain (no customizations) line for a product variant. */
  getPlainLineQuantity: (productId: string, variantId?: string | null) => number;
  /** Find the plain cart line id for a product variant, if any. */
  getPlainLineId: (productId: string, variantId?: string | null) => string | null;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
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

      removeTopping: (itemId,productId,variantId) => set((state) => ({ items:removeCartTopping(state.items,itemId,productId,variantId) })),

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

      getItemPrice: cartItemPrice,

      getTotalPrice: () => {
        const { items, getItemPrice } = get();
        return items.reduce((sum, item) => sum + getItemPrice(item), 0);
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
    }),
    {
      name: 'belok-cart',
      // v1: collapse duplicate lines that older versions of the store
      // accumulated in persisted carts.
      version: 1,
      migrate: (persisted) => {
        const state = persisted as { items?: CartItem[] } | undefined;
        return { ...state, items: mergeDuplicateItems(state?.items ?? []) };
      },
    }
  )
);
