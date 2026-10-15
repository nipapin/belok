import { resolveVariant } from './productOptions';
import { formatVariantTitle } from './productTitle';
import type { ProductVariant } from '@/types';
import type { CartItem } from '@/store/cartStore';

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

export function toppingOptions(toppings: ToppingProduct[] = []) {
  return toppings.filter((topping) => topping.isAvailable && topping.categoryActive).flatMap((topping) =>
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

/** Toppings remain catalog products, so normal checkout pricing, receipts and stock apply. */
export function toppingCartItems(toppings: ToppingProduct[], selected: Set<string>, quantity: number): Omit<CartItem, 'id'>[] {
  return toppingOptions(toppings).filter((option) => selected.has(option.key)).map((option) => ({
    productId: option.productId,
    variantId: option.variantId,
    variantName: option.variantName,
    name: option.name,
    image: option.image,
    basePrice: option.price,
    quantity,
    customizations: [],
  }));
}
