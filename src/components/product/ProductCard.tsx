'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';

export type ProductCardModel = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  calories: number | null;
  proteins: number | null;
};

type ProductCardProps = {
  product: ProductCardModel;
};

export function ProductCard({ product }: ProductCardProps) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const [justAdded, setJustAdded] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      basePrice: product.price,
      quantity: 1,
      customizations: [],
    });
    setJustAdded(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustAdded(false), 700);
  }

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={() => router.push(`/menu/${product.id}`)}
        className="glass-panel lg-interactive group flex h-full w-full cursor-pointer flex-col overflow-hidden text-left"
      >
        <div className="relative flex h-[150px] items-center justify-center bg-zinc-100/80">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-5xl font-bold text-zinc-200/80">{product.name[0]}</span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <p className="mb-1 line-clamp-2 min-h-[2.6rem] text-sm font-semibold leading-snug text-(--lg-text)">
            {product.name}
          </p>
          {product.calories != null && (
            <p className="text-xs text-(--lg-text-muted)">
              {product.calories} ккал
              {product.proteins != null && (
                <span>
                  {' '}
                  · Б {product.proteins} г
                </span>
              )}
            </p>
          )}
          <p className="mt-auto pt-1 pr-12 text-base font-bold text-(--lg-text)">{product.price} ₽</p>
        </div>
      </button>
      <button
        type="button"
        onClick={handleAdd}
        aria-label={`Добавить ${product.name} в корзину`}
        aria-pressed={justAdded}
        className={`lg-interactive absolute right-2 bottom-2 inline-flex size-9 items-center justify-center rounded-full border backdrop-blur-md transition ${
          justAdded
            ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-50'
            : 'border-(--lg-ring) bg-(--lg-fill) text-(--lg-text)'
        }`}
      >
        {justAdded ? (
          <Check className="size-[18px]" strokeWidth={2.5} />
        ) : (
          <Plus className="size-[18px]" strokeWidth={2.25} />
        )}
      </button>
    </div>
  );
}
