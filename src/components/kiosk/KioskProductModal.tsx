'use client';

import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import ProductOptions from '@/components/product/ProductOptions';
import ProductGallery from '@/components/product/ProductGallery';
import { optionCustomizations, resolveVariant } from '@/lib/productOptions';
import { nutritionChips } from '@/components/product/FoodCard';
import { SpicinessBadge } from '@/components/product/SpicinessBadge';
import { formatVariantTitle } from '@/lib/productTitle';
import { NutritionChip } from '@/components/product/NutritionChip';
import { isNewProduct } from '@/lib/productFlags';
import { useKioskCartStore } from '@/store/kioskCartStore';
import type { Product } from '@/types';
import { fetchKioskCatalog, kioskCatalogRefresh } from '@/lib/kioskCatalog';
import '@/components/product/food-card.css';

type KioskProductModalProps = {
  productId: string;
  variantId?: string | null;
  onClose: () => void;
};

export default function KioskProductModal({ productId, variantId = null, onClose }: KioskProductModalProps) {
  const addItem = useKioskCartStore((s) => s.addItem);
  const [pickedVariantId, setPickedVariantId] = useState(variantId);
  const [quantity, setQuantity] = useState(1);
  const [removedIngredients, setRemovedIngredients] = useState<Set<string>>(new Set());
  const [addedExtras, setAddedExtras] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['kiosk', 'product', productId],
    queryFn: ({ signal }) => fetchKioskCatalog<{ product: Product | null }>(`/api/products/${productId}`, signal, { product: null }),
    ...kioskCatalogRefresh,
  });

  const product = data?.product;
  const variant = product?.variants?.find((item) => item.id === pickedVariantId) ?? product?.variants?.[0] ?? null;
  const display = product ? resolveVariant(product, variant) : null;
  const displayName = product
    ? formatVariantTitle(product.name, variant?.name)
    : '';
  const displayImage = variant?.image || product?.image || null;

  const getCustomizations = () => product ? optionCustomizations(product.ingredients, removedIngredients, addedExtras) : [];
  const extrasTotal = getCustomizations().reduce((sum, choice) => sum + choice.priceDelta, 0);
  const linePrice = display ? Math.round((display.price + extrasTotal) * quantity * 100) / 100 : 0;
  const chips = display ? nutritionChips(display) : [];

  function handleAdd() {
    if (!product || product.isAvailable === false) return;
    addItem({
      productId: product.id,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      name: displayName,
      image: displayImage,
      basePrice: display!.price,
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
              <div className="mt-3 overflow-hidden rounded-2xl">
                <ProductGallery slides={(product.variants.length ? product.variants : [{ id: product.id, name: product.name, image: product.image }]).map((entry) => ({ key: entry.id, image: entry.image || product.image, alt: entry.name, fallback: entry.name[0] }))} index={Math.max(0, product.variants.findIndex((entry) => entry.id === variant?.id))} onIndex={(index) => setPickedVariantId(product.variants[index]?.id ?? null)} />
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
                  <h2 className="text-2xl font-semibold text-(--lg-text)">{displayName}</h2>
                </div>
                <p className="shrink-0 text-2xl font-bold tabular-nums">{display!.price} ₽</p>
              </div>
              {display?.volumeMl != null ? <p className="mt-2 text-sm font-medium">{display.volumeMl} мл</p> : null}
              <SpicinessBadge level={product.spicinessLevel} className="mt-2" />
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

              <ProductOptions links={product.ingredients} removed={removedIngredients} added={addedExtras} onRemoved={setRemovedIngredients} onAdded={setAddedExtras} />
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
                onClick={() => setQuantity((q) => Math.min(100, q + 1))}
                aria-label="Больше"
              >
                <Plus className="size-5" />
              </button>
            </div>
            <button type="button" className="btn-primary min-h-14 flex-1 text-lg" disabled={product.isAvailable === false} onClick={handleAdd}>
              {product.isAvailable === false ? 'Блюдо сейчас недоступно' : `В заказ · ${linePrice} ₽`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
