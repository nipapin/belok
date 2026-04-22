'use client';

import { useRouter } from 'next/navigation';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';

export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, getItemPrice, getTotalPrice, clearCart } = useCartStore();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-2 py-16 text-center">
        <ShoppingCart className="mx-auto mb-4 size-20 text-(--lg-text-muted) opacity-70" strokeWidth={1.25} />
        <h1 className="heading-section mb-2">Корзина пуста</h1>
        <p className="mb-6 text-sm text-(--lg-text-muted)">Добавьте блюда из меню</p>
        <button type="button" className="btn-primary" onClick={() => router.push('/menu')}>
          Перейти в меню
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-2 pb-4 pt-4">
      <div className="mb-5 flex items-center justify-between gap-2 px-1">
        <h1 className="heading-section m-0">Корзина</h1>
        <button
          type="button"
          className="rounded-full border border-transparent px-3 py-1.5 text-sm font-semibold text-(--lg-text-muted) transition"
          onClick={clearCart}
        >
          Очистить
        </button>
      </div>

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <div className="glass-panel flex overflow-hidden p-0">
              <div className="relative w-24 shrink-0 self-stretch bg-[color-mix(in_srgb,var(--lg-text)_10%,transparent)] sm:w-28">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-(--lg-text-muted)">
                    {item.name?.[0] ?? '?'}
                  </span>
                )}
              </div>
              <div className="flex min-h-22 min-w-0 flex-1 flex-col justify-between gap-2 py-3 pl-3.5 pr-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[0.9375rem] font-semibold leading-snug text-(--lg-text)">{item.name}</p>
                    <button
                      type="button"
                      className="btn-icon size-8 min-h-8 min-w-8 shrink-0"
                      onClick={() => removeItem(item.id)}
                      aria-label="Удалить"
                    >
                      <Trash2 className="size-[15px]" strokeWidth={2} />
                    </button>
                  </div>
                  {item.customizations.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.customizations.map((c, i) => (
                        <span
                          key={i}
                          className="rounded-md border border-(--lg-ring) bg-[color-mix(in_srgb,var(--lg-fill)_70%,transparent)] px-2 py-0.5 text-[10px] font-medium leading-tight text-(--lg-text-muted)"
                        >
                          {c.action === 'REMOVE' ? 'Без ' : '+'}
                          {c.ingredientName}
                          {c.priceDelta ? ` · +${c.priceDelta} ₽` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--lg-text)_10%,transparent)] pt-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn-icon size-8 min-h-8 min-w-8"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      aria-label="Меньше"
                    >
                      <Minus className="size-3.5" strokeWidth={2.25} />
                    </button>
                    <span className="min-w-6 text-center text-sm font-bold tabular-nums text-(--lg-text)">{item.quantity}</span>
                    <button
                      type="button"
                      className="btn-icon size-8 min-h-8 min-w-8"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      aria-label="Больше"
                    >
                      <Plus className="size-3.5" strokeWidth={2.25} />
                    </button>
                  </div>
                  <p className="shrink-0 text-base font-bold tabular-nums tracking-tight text-(--lg-text)">{getItemPrice(item)} ₽</p>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <hr className="my-6 border-t border-[color-mix(in_srgb,var(--lg-text)_12%,transparent)]" />

      <div className="mb-6 flex items-center justify-between gap-2 px-0.5">
        <span className="text-lg font-semibold text-(--lg-text)">Итого</span>
        <span className="text-xl font-bold tabular-nums tracking-tight text-(--lg-text)">{getTotalPrice()} ₽</span>
      </div>

      <button type="button" className="btn-primary w-full py-3.5" onClick={() => router.push('/checkout')}>
        Оформить заказ
      </button>
    </div>
  );
}
