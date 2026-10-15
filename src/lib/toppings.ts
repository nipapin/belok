import { resolveVariant } from './productOptions';
import { formatVariantTitle } from './productTitle';
import type { ProductVariant } from '@/types';
import type { CartTopping } from '@/store/cartStore';

export interface ToppingProduct {
  id: string;
  name: string;
  price: number;
  image: string | null;
  isAvailable: boolean;
  categoryActive: boolean;
  variants: ProductVariant[];
}

export function isToppingsCategory(name: string): boolean {
  return /^топп?инги?$/iu.test(name.trim());
}

export function parseNewTopping(raw: unknown): { name: string; price: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, price } = raw as { name?: unknown; price?: unknown };
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) return null;
  if (typeof price !== 'string' && typeof price !== 'number') return null;
  const value = String(price).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > 1_000_000) return null;
  return { name: name.trim(), price: Number(value) };
}

export function toppingOptions(toppings: ToppingProduct[] = []) {
  return toppings.filter((topping) => topping.isAvailable).flatMap((topping) =>
    (topping.variants.length ? topping.variants : [null]).map((variant) => ({
      key: JSON.stringify([topping.id, variant?.id ?? null]),
      productId: topping.id,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      name: formatVariantTitle(topping.name, variant?.name),
      image: variant?.image || topping.image,
      price: resolveVariant(topping, variant).price,
    })).filter((option) => Number.isFinite(option.price) && option.price >= 0)
  );
}

/** Catalog products attached to one dish; their quantity follows that dish. */
export function toppingCartItems(toppings: ToppingProduct[], selected: Set<string>): CartTopping[] {
  return toppingOptions(toppings).filter((option) => selected.has(option.key)).map((option) => ({
    productId: option.productId,
    variantId: option.variantId,
    variantName: option.variantName,
    name: option.name,
    image: option.image,
    basePrice: option.price,
  }));
}
