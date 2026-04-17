'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCartStore, type CartItemCustomization } from '@/store/cartStore';

interface ProductIngredient {
  id: string;
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
  ingredient: {
    id: string;
    name: string;
    price: number;
  };
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  calories: number | null;
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  category: { name: string };
  ingredients: ProductIngredient[];
}

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  id: string;
}) {
  return (
    <label htmlFor={id} className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-zinc-200 transition peer-checked:bg-zinc-900" />
      <span className="pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-[1.25rem]" />
    </label>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  const [quantity, setQuantity] = useState(1);
  const [removedIngredients, setRemovedIngredients] = useState<Set<string>>(new Set());
  const [addedExtras, setAddedExtras] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => fetch(`/api/products/${id}`).then((r) => r.json()),
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

  const calcPrice = () => {
    if (!product) return 0;
    const extras = getCustomizations().reduce((s, c) => s + c.priceDelta, 0);
    return (product.price + extras) * quantity;
  };

  const handleAddToCart = () => {
    if (!product) return;
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      basePrice: product.price,
      quantity,
      customizations: getCustomizations(),
    });
    router.push('/cart');
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg pt-2">
        <div className="glass-tight mb-4 h-[250px] animate-pulse" />
        <div className="h-8 w-[60%] max-w-xs animate-pulse rounded-lg bg-white/40" />
        <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-white/30" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-lg font-semibold text-zinc-700">Товар не найден</p>
        <button type="button" className="btn-primary mt-4" onClick={() => router.push('/menu')}>
          Вернуться в меню
        </button>
      </div>
    );
  }

  const defaultIngredients = product.ingredients.filter((pi) => pi.isDefault);
  const extraIngredients = product.ingredients.filter((pi) => pi.isExtra);

  return (
    <div className="pb-28">
      <div className="relative -mx-4">
        <div className="flex h-[280px] items-center justify-center bg-zinc-200/60">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[6rem] font-bold leading-none text-zinc-300/90">{product.name[0]}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-icon absolute left-4 top-4 border-white/70 bg-white/85 shadow-md"
          aria-label="Назад"
        >
          <ArrowLeft className="size-5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="mx-auto max-w-lg pt-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <span className="mb-2 inline-block rounded-full border border-white/50 bg-white/55 px-3 py-1 text-xs font-semibold text-zinc-600 backdrop-blur-md">
              {product.category.name}
            </span>
            <h1 className="heading-section text-balance">{product.name}</h1>
          </div>
          <p className="shrink-0 text-xl font-bold tracking-tight text-zinc-900">{product.price} ₽</p>
        </div>

        {product.description && (
          <p className="mb-4 text-sm leading-relaxed text-zinc-600">{product.description}</p>
        )}

        {product.calories != null && (
          <div className="glass-tight mb-6 flex justify-around gap-2 px-2 py-4">
            {[
              { label: 'Ккал', value: product.calories },
              { label: 'Белки, г', value: product.proteins },
              { label: 'Жиры, г', value: product.fats },
              { label: 'Углеводы, г', value: product.carbs },
            ].map((item) => (
              <div key={item.label} className="min-w-0 flex-1 text-center">
                <p className="text-base font-bold text-zinc-900">{item.value ?? '—'}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{item.label}</p>
              </div>
            ))}
          </div>
        )}

        {defaultIngredients.length > 0 && (
          <>
            <h2 className="mb-2 text-base font-semibold text-zinc-900">Состав</h2>
            <div className="glass-panel mb-4 divide-y divide-zinc-900/6 p-1">
              {defaultIngredients.map((pi) => (
                <div key={pi.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span
                    className={`text-sm ${
                      removedIngredients.has(pi.ingredient.id)
                        ? 'text-zinc-400 line-through'
                        : 'text-zinc-800'
                    }`}
                  >
                    {pi.ingredient.name}
                  </span>
                  {pi.isRemovable && (
                    <Toggle
                      id={`ing-${pi.id}`}
                      checked={!removedIngredients.has(pi.ingredient.id)}
                      onChange={() => toggleRemove(pi.ingredient.id)}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {extraIngredients.length > 0 && (
          <>
            <h2 className="mb-2 text-base font-semibold text-zinc-900">Добавить</h2>
            <div className="glass-panel mb-6 divide-y divide-zinc-900/6 p-1">
              {extraIngredients.map((pi) => (
                <div key={pi.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{pi.ingredient.name}</p>
                    <p className="text-xs text-zinc-500">+{pi.ingredient.price} ₽</p>
                  </div>
                  <Toggle
                    id={`ex-${pi.id}`}
                    checked={addedExtras.has(pi.ingredient.id)}
                    onChange={() => toggleExtra(pi.ingredient.id)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mb-6 flex items-center justify-center gap-4">
          <button
            type="button"
            className="btn-icon"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            aria-label="Меньше"
          >
            <Minus className="size-4" />
          </button>
          <span className="min-w-[2.5rem] text-center text-xl font-bold tabular-nums">{quantity}</span>
          <button
            type="button"
            className="btn-icon"
            onClick={() => setQuantity(quantity + 1)}
            aria-label="Больше"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <div className="glass-panel-strong sticky bottom-[calc(88px+env(safe-area-inset-bottom,0px))] border-zinc-900/8 p-4">
          <button type="button" className="btn-primary w-full" onClick={handleAddToCart}>
            <ShoppingCart className="size-5" strokeWidth={1.75} />
            В корзину · {calcPrice()} ₽
          </button>
        </div>
      </div>
    </div>
  );
}
