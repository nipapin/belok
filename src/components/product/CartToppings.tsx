import type { CartTopping } from '@/store/cartStore';

export default function CartToppings({ toppings = [], quantity = 1 }: { toppings?: CartTopping[]; quantity?: number }) {
  if (!toppings.length) return null;
  return <div className="mt-1.5 space-y-1 border-l-2 border-emerald-600/30 pl-2.5" data-cart-toppings>
    {toppings.map((topping) => <p key={JSON.stringify([topping.productId,topping.variantId])} className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs leading-snug text-(--lg-text-muted)"><span>+ {topping.name}</span><span className="tabular-nums">{new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(topping.basePrice * quantity)} ₽</span></p>)}
  </div>;
}
