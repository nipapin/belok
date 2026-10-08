import { fetchProductsWithRelations } from '@/lib/queries/products';
import { optionCustomizations, resolveVariant, type OptionCustomization } from '@/lib/productOptions';
import { VariantOrderError } from '@/lib/productVariants';
import type { ProductWithRelations } from '@/lib/types';

export interface IncomingOrderItem {
  productId: string;
  variantId?: string | null;
  quantity: number;
  customizations?: { ingredientId: string; action: 'ADD' | 'REMOVE'; priceDelta?: number }[];
}
export interface PricedOrderItem {
  productId: string;
  variantId: string | null;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  customizations: OptionCustomization[];
}

export function priceOrderItem(item: IncomingOrderItem, product: ProductWithRelations): PricedOrderItem {
  const fail = (message: string): never => { throw new VariantOrderError(message); };
  if (!product.isAvailable || !product.category.isActive) fail('Товар недоступен для заказа');
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) fail('Некорректное количество товара');
  const variant = product.variants.find((entry) => entry.id === item.variantId);
  if (product.variants.length && !variant) fail('Выберите доступный вариант товара');
  if (item.variantId && !variant) fail('Вариант товара не найден');
  if (item.customizations != null && !Array.isArray(item.customizations)) fail('Некорректные добавки');
  const removed = new Set<string>();
  const added = new Set<string>();
  const seen = new Set<string>();
  const groups = new Set<string>();
  for (const choice of item.customizations ?? []) {
    if (!choice || typeof choice.ingredientId !== 'string' || seen.has(choice.ingredientId)) fail('Некорректные добавки');
    seen.add(choice.ingredientId);
    const link = product.ingredients.find((entry) => entry.ingredient.id === choice.ingredientId);
    if (!link) fail('Ингредиент недоступен для этого товара');
    if (choice.action === 'ADD') {
      if (!link!.isExtra || !link!.ingredient.isAvailable || !Number.isFinite(link!.ingredient.price) || link!.ingredient.price < 0) fail('Добавка недоступна');
      if (link!.optionGroup && groups.has(link!.optionGroup)) fail('Выберите один вариант в каждой группе добавок');
      if (link!.optionGroup) groups.add(link!.optionGroup);
      added.add(choice.ingredientId);
    } else if (choice.action === 'REMOVE') {
      if (!link!.isDefault || !link!.isRemovable) fail('Этот ингредиент нельзя убрать');
      removed.add(choice.ingredientId);
    } else fail('Некорректное действие с ингредиентом');
  }
  // A replacement always removes the base ingredient, even if the client omitted it.
  const customizations = optionCustomizations(product.ingredients, removed, added);
  const unitPrice = Math.round((resolveVariant(product, variant).price + customizations.reduce((sum, choice) => sum + choice.priceDelta, 0)) * 100) / 100;
  if (!Number.isFinite(unitPrice) || unitPrice < 0) fail('Некорректная цена товара');
  return { productId: product.id, variantId: variant?.id ?? null, variantName: variant?.name ?? null, quantity: item.quantity, unitPrice, customizations };
}

export async function priceOrderItems(items: IncomingOrderItem[]): Promise<PricedOrderItem[]> {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) throw new VariantOrderError('Некорректный состав заказа');
  const ids = new Set(items.map((item) => item?.productId));
  if ([...ids].some((id) => typeof id !== 'string' || !id)) throw new VariantOrderError('Товар не найден');
  const products = await fetchProductsWithRelations({ productIds: [...ids] });
  const map = new Map(products.map((product) => [product.id, product]));
  return items.map((item) => {
    const product = map.get(item.productId);
    if (!product) throw new VariantOrderError('Товар не найден');
    return priceOrderItem(item, product);
  });
}
