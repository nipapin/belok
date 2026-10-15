'use client';

import { X } from 'lucide-react';
import type { CartTopping } from '@/store/cartStore';

export default function CartToppings({ toppings = [], quantity = 1, onRemove }: { toppings?: CartTopping[]; quantity?: number; onRemove?: (topping: CartTopping) => void }) {
  if (!toppings.length) return null;
  return <div className="mt-1.5 space-y-1 border-l-2 border-emerald-600/30 pl-2.5" data-cart-toppings>
    {toppings.map((topping) => <div key={JSON.stringify([topping.productId,topping.variantId])} className="flex items-center justify-between gap-2 text-xs leading-snug text-(--lg-text-muted)">
      <span className="min-w-0 break-words">+ {topping.name}</span>
      <span className="flex shrink-0 items-center gap-1"><span className="tabular-nums">{new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(topping.basePrice * quantity)} ₽</span>{onRemove && <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-(--lg-text) transition hover:bg-[color-mix(in_srgb,var(--lg-text)_10%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" aria-label={`Убрать топпинг ${topping.name}`} title={`Убрать ${topping.name}`} onClick={() => onRemove(topping)}><X size={15} aria-hidden="true" /></button>}</span>
    </div>)}
  </div>;
}
