'use client';

import { useRouter } from 'next/navigation';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';

export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, getItemPrice, getTotalPrice, clearCart } = useCartStore();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShoppingCart className="mx-auto mb-4 size-20 text-[var(--lg-text-muted)] opacity-70" strokeWidth={1.25} />
        <h1 className="heading-section mb-2">Корзина пуста</h1>
        <p className="mb-6 text-sm text-[var(--lg-text-muted)]">Добавьте блюда из меню</p>
        <button type="button" className="btn-primary" onClick={() => router.push('/menu')}>
          Перейти в меню
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-4 pt-4">
      <div className="mb-4 flex items-center justify-between gap-2 px-1">
        <h1 className="heading-section m-0">Корзина</h1>
        <button
          type="button"
          className="rounded-full border border-transparent px-3 py-1.5 text-sm font-semibold text-[var(--lg-text-muted)] transition hover:border-[var(--lg-ring)] hover:bg-[var(--lg-fill)] hover:text-[var(--lg-text)]"
          onClick={clearCart}
        >
          Очистить
        </button>
      </div>

      {items.map((item) => (
        <div key={item.id} className="glass-panel mb-3 p-4">
          <div className="flex justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--lg-text)]">{item.name}</p>
              {item.customizations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.customizations.map((c, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-[var(--lg-ring)] bg-[color-mix(in_srgb,var(--lg-fill)_85%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--lg-text-muted)]"
                    >
                      {c.action === 'REMOVE' ? 'Без: ' : '+'}
                      {c.ingredientName}
                      {c.priceDelta ? ` +${c.priceDelta} ₽` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn-icon size-9 shrink-0"
              onClick={() => removeItem(item.id)}
              aria-label="Удалить"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-icon size-9"
                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                aria-label="Меньше"
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums text-[var(--lg-text)]">
                {item.quantity}
              </span>
              <button
                type="button"
                className="btn-icon size-9"
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                aria-label="Больше"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <p className="text-base font-bold tabular-nums text-[var(--lg-text)]">{getItemPrice(item)} ₽</p>
          </div>
        </div>
      ))}

      <hr className="my-6 border-t border-[color-mix(in_srgb,var(--lg-text)_12%,transparent)]" />

      <div className="mb-6 flex items-center justify-between gap-2">
        <span className="text-lg font-semibold text-[var(--lg-text)]">Итого</span>
        <span className="text-xl font-bold tabular-nums text-[var(--lg-text)]">{getTotalPrice()} ₽</span>
      </div>

      <button type="button" className="btn-primary w-full py-3.5" onClick={() => router.push('/checkout')}>
        Оформить заказ
      </button>
    </div>
  );
}
