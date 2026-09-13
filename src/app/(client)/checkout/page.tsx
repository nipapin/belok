'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useHaptic } from '@/hooks/useHaptic';
import EffortSlider from '@/components/ui/EffortSlider';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotalPrice, clearCart, getItemPrice } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const haptic = useHaptic();

  const [bonusUsed, setBonusUsed] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const subtotal = getTotalPrice();
  const discountPercent = user?.loyaltyLevel?.discountPercent || 0;
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const afterDiscount = subtotal - discountAmount;
  const maxBonus = Math.min(afterDiscount, user?.bonusBalance || 0);
  const total = afterDiscount - bonusUsed;

  useEffect(() => {
    if (items.length === 0) {
      router.push('/cart');
    }
  }, [items.length, router]);

  const handleOrder = async () => {
    setError('');
    setLoading(true);
    try {
      const orderItems = items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        customizations: item.customizations.map((c) => ({
          ingredientId: c.ingredientId,
          action: c.action,
          priceDelta: c.priceDelta,
        })),
      }));

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: orderItems, bonusUsed, comment }),
      });

      const data = await res.json();
      if (!res.ok) {
        haptic('error');
        setError(data.error || 'Не удалось оформить заказ');
        return;
      }

      haptic('success');
      clearCart();
      router.push(`/orders/${data.order.id}`);
    } catch {
      haptic('error');
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto max-w-md px-2 pb-4 pt-2">
      <h1 className="heading-section mb-6">Оформление заказа</h1>

      <div className="glass-panel mb-4 p-4">
        <h2 className="mb-3 text-base font-semibold text-(--lg-text)">Ваш заказ</h2>
        {items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2 py-1.5 text-sm">
            <span className="text-(--lg-text)">
              {item.name} ×{item.quantity}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-(--lg-text)">{getItemPrice(item)} ₽</span>
          </div>
        ))}
        <hr className="my-3 border-[color-mix(in_srgb,var(--lg-text)_12%,transparent)]" />
        <div className="flex justify-between text-sm">
          <span className="text-(--lg-text-muted)">Подытог</span>
          <span className="tabular-nums text-(--lg-text)">{subtotal} ₽</span>
        </div>
        {discountAmount > 0 && (
          <div className="mt-1 flex justify-between text-sm text-emerald-400">
            <span>
              Скидка {discountPercent}% ({user?.loyaltyLevel?.name})
            </span>
            <span className="tabular-nums">−{discountAmount} ₽</span>
          </div>
        )}
        {bonusUsed > 0 && (
          <div className="mt-1 flex justify-between text-sm text-amber-300">
            <span>Бонусы</span>
            <span className="tabular-nums">−{bonusUsed} ₽</span>
          </div>
        )}
        <hr className="my-3 border-[color-mix(in_srgb,var(--lg-text)_12%,transparent)]" />
        <div className="flex justify-between text-base font-semibold text-(--lg-text)">
          <span>Итого</span>
          <span className="tabular-nums">{total} ₽</span>
        </div>
      </div>

      {user && maxBonus > 0 && (
        <div className="glass-panel mb-4 p-4">
          <h2 className="mb-1 text-base font-semibold text-(--lg-text)">Списать бонусы</h2>
          <p className="mb-4 text-sm text-(--lg-text-muted)">
            Доступно: {user.bonusBalance} (можно оплатить до 100% суммы)
          </p>
          <EffortSlider
            min={0}
            max={maxBonus}
            value={bonusUsed}
            onChange={setBonusUsed}
            ariaLabel="Списать бонусы"
          />
          <p className="mt-3 text-center text-sm tabular-nums text-(--lg-text)">
            Списать: {bonusUsed}
          </p>
        </div>
      )}

      <label className="mb-4 block">
        <span className="mb-1.5 block text-sm font-medium text-(--lg-text)">Комментарий к заказу</span>
        <textarea
          className="min-h-[88px] w-full resize-none rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-4 py-3 text-sm text-(--lg-text) outline-none placeholder:text-(--lg-text-muted) focus:border-(--lg-ring-strong) focus:ring-2 focus:ring-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Пожелания по заказу…"
        />
      </label>

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-400/35 bg-rose-500/18 px-3 py-3 text-sm text-(--lg-text)">
          {error}
        </div>
      )}

      {user?.loyaltyLevel && (
        <div className="glass-panel mb-4 px-4 py-3 text-sm text-(--lg-text)">
          После выполнения заказа начислим кэшбэк {user.loyaltyLevel.cashbackPercent}% (≈
          {Math.round(total * (user.loyaltyLevel.cashbackPercent / 100))} бонусов)
        </div>
      )}

      <button
        type="button"
        className="btn-primary w-full py-3.5"
        onClick={handleOrder}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Check className="size-5" strokeWidth={1.75} />
        )}
        {loading ? 'Оформляем…' : `Оформить заказ · ${total} ₽`}
      </button>
    </div>
  );
}
