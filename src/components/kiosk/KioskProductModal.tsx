'use client';

import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { nutritionChips } from '@/components/product/FoodCard';
import { NutritionChip } from '@/components/product/NutritionChip';
import { isNewProduct } from '@/lib/productFlags';
import { useKioskCartStore, type CartItemCustomization } from '@/store/kioskCartStore';
import type { Product } from '@/types';
import '@/components/product/food-card.css';

function Toggle({ checked, onChange, id }: { checked: boolean; onChange: () => void; id: string }) {
  return (
    <label htmlFor={id} className="relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--lg-text)_12%,transparent)] transition peer-checked:bg-emerald-600" />
      <span className="pointer-events-none absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-[1.5rem]" />
    </label>
  );
}

type KioskProductModalProps = {
  productId: string;
  onClose: () => void;
};

export default function KioskProductModal({ productId, onClose }: KioskProductModalProps) {
  const addItem = useKioskCartStore((s) => s.addItem);
  const [quantity, setQuantity] = useState(1);
  const [removedIngredients, setRemovedIngredients] = useState<Set<string>>(new Set());
  const [addedExtras, setAddedExtras] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetch(`/api/products/${productId}`).then((r) => r.json()),
  });

  const product: Product | undefined = data?.product;

  const toggleRemove = (ingredientId: string) => {
    setRemovedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      return next;
    });
  };

  const toggleExtra = (ingredientId: string) => {
    setAddedExtras((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      return next;
    });
  };

  const getCustomizations = (): CartItemCustomization[] => {
    if (!product) return [];
    const customizations: CartItemCustomization[] = [];
    for (const pi of product.ingredients) {
      if (pi.isDefault && pi.isRemovable && removedIngredients.has(pi.ingredient.id)) {
        customizations.push({
          ingredientId: pi.ingredient.id,
          ingredientName: pi.ingredient.name,
          action: 'REMOVE',
          priceDelta: 0,
        });
      }
      if (pi.isExtra && addedExtras.has(pi.ingredient.id)) {
        customizations.push({
          ingredientId: pi.ingredient.id,
          ingredientName: pi.ingredient.name,
          action: 'ADD',
          priceDelta: pi.ingredient.price,
        });
      }
    }
    return customizations;
  };

  const extrasTotal = getCustomizations().reduce((s, c) => s + c.priceDelta, 0);
  const linePrice = product ? (product.price + extrasTotal) * quantity : 0;
  const chips = product ? nutritionChips(product) : [];

  function handleAdd() {
    if (!product) return;
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      basePrice: product.price,
      quantity,
      customizations: getCustomizations(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[1400] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-sm" aria-label="Закрыть" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="glass-panel-strong relative z-[1] flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.5rem] sm:rounded-[1.5rem]"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <p className="text-lg font-semibold text-(--lg-text)">Блюдо</p>
          <button type="button" className="btn-icon size-11" onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {isLoading ? (
            <div className="mt-4 h-64 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--lg-fill)_70%,transparent)]" />
          ) : !product ? (
            <p className="py-10 text-center text-(--lg-text-muted)">Товар не найден</p>
          ) : (
            <>
              <div className="food-card__media mt-3 overflow-hidden rounded-2xl">
                {product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image} alt="" className="food-card__img" />
                ) : (
                  <span className="food-card__fallback" aria-hidden>
                    {product.name[0]}
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="rounded-full border border-(--lg-ring) px-3 py-1 text-xs font-semibold text-(--lg-text-muted)">
                      {product.category.name}
                    </span>
                    {isNewProduct(product.createdAt) ? (
                      <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                        Новинка
                      </span>
                    ) : null}
                  </div>
                  <h2 className="text-2xl font-semibold text-(--lg-text)">{product.name}</h2>
                </div>
                <p className="shrink-0 text-2xl font-bold tabular-nums">{product.price} ₽</p>
              </div>
              {chips.length > 0 ? (
                <div className="food-card__chips mt-3">
                  {chips.map((label) => (
                    <NutritionChip key={label} label={label} />
                  ))}
                </div>
              ) : null}
              {product.description ? (
                <p className="mt-3 text-sm leading-relaxed text-(--lg-text-muted)">{product.description}</p>
              ) : null}

              {product.ingredients.filter((pi) => pi.isDefault).length > 0 ? (
                <>
                  <h3 className="mt-6 mb-2 text-base font-semibold">Состав</h3>
                  <div className="glass-panel divide-y divide-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] p-1">
                    {product.ingredients
                      .filter((pi) => pi.isDefault)
                      .map((pi) => (
                        <div key={pi.id} className="flex items-center justify-between gap-3 px-3 py-3">
                          <span
                            className={`text-base ${
                              removedIngredients.has(pi.ingredient.id)
                                ? 'text-(--lg-text-muted) line-through opacity-70'
                                : 'text-(--lg-text)'
                            }`}
                          >
                            {pi.ingredient.name}
                          </span>
                          {pi.isRemovable ? (
                            <Toggle
                              id={`kiosk-ing-${pi.id}`}
                              checked={!removedIngredients.has(pi.ingredient.id)}
                              onChange={() => toggleRemove(pi.ingredient.id)}
                            />
                          ) : null}
                        </div>
                      ))}
                  </div>
                </>
              ) : null}

              {product.ingredients.filter((pi) => pi.isExtra).length > 0 ? (
                <>
                  <h3 className="mt-6 mb-2 text-base font-semibold">Добавить</h3>
                  <div className="glass-panel divide-y divide-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] p-1">
                    {product.ingredients
                      .filter((pi) => pi.isExtra)
                      .map((pi) => (
                        <div key={pi.id} className="flex items-center justify-between gap-3 px-3 py-3">
                          <div>
                            <p className="text-base font-medium">{pi.ingredient.name}</p>
                            <p className="text-sm text-(--lg-text-muted)">+{pi.ingredient.price} ₽</p>
                          </div>
                          <Toggle
                            id={`kiosk-ex-${pi.id}`}
                            checked={addedExtras.has(pi.ingredient.id)}
                            onChange={() => toggleExtra(pi.ingredient.id)}
                          />
                        </div>
                      ))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>

        {product ? (
          <div className="flex items-center justify-between gap-3 border-t border-(--lg-ring) px-5 py-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-icon size-12"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Меньше"
              >
                <Minus className="size-5" />
              </button>
              <span className="min-w-10 text-center text-2xl font-bold tabular-nums">{quantity}</span>
              <button
                type="button"
                className="btn-icon size-12"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Больше"
              >
                <Plus className="size-5" />
              </button>
            </div>
            <button type="button" className="btn-primary min-h-14 flex-1 text-lg" onClick={handleAdd}>
              В заказ · {linePrice} ₽
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
