'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Loader2 } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotalPrice, clearCart, getItemPrice } = useCartStore();
  const user = useAuthStore((s) => s.user);

  const [bonusUsed, setBonusUsed] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const subtotal = getTotalPrice();
  const discountPercent = user?.loyaltyLevel?.discountPercent || 0;
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const afterDiscount = subtotal - discountAmount;
  const maxBonus = Math.min(Math.floor(afterDiscount * 0.3), user?.bonusBalance || 0);
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
        setError(data.error || 'Не удалось оформить заказ');
        return;
      }

      clearCart();

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        router.push(`/orders/${data.order.id}`);
      }
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto max-w-md pb-4 pt-2">
      <h1 className="heading-section mb-6">Оформление заказа</h1>

      <div className="glass-panel mb-4 p-4">
        <h2 className="mb-3 text-base font-semibold text-zinc-900">Ваш заказ</h2>
        {items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2 py-1.5 text-sm">
            <span className="text-zinc-700">
              {item.name} ×{item.quantity}
            </span>
            <span className="shrink-0 font-semibold text-zinc-900">{getItemPrice(item)} ₽</span>
          </div>
        ))}
        <hr className="my-3 border-zinc-900/10" />
        <div className="flex justify-between text-sm">
          <span className="text-zinc-600">Подытог</span>
          <span>{subtotal} ₽</span>
        </div>
        {discountAmount > 0 && (
          <div className="mt-1 flex justify-between text-sm text-emerald-700">
            <span>
              Скидка {discountPercent}% ({user?.loyaltyLevel?.name})
            </span>
            <span>−{discountAmount} ₽</span>
          </div>
        )}
        {bonusUsed > 0 && (
          <div className="mt-1 flex justify-between text-sm text-amber-800">
            <span>Бонусы</span>
            <span>−{bonusUsed} ₽</span>
          </div>
        )}
        <hr className="my-3 border-zinc-900/10" />
        <div className="flex justify-between text-base font-semibold">
          <span>Итого</span>
          <span>{total} ₽</span>
        </div>
      </div>

      {user && maxBonus > 0 && (
        <div className="glass-panel mb-4 p-4">
          <h2 className="mb-1 text-base font-semibold text-zinc-900">Списать бонусы</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Доступно: {user.bonusBalance} (не более 30% от суммы после скидки)
          </p>
          <input
            type="range"
            min={0}
            max={maxBonus}
            step={1}
            value={bonusUsed}
            onChange={(e) => setBonusUsed(Number(e.target.value))}
            className="mb-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900"
          />
          <p className="text-center text-sm text-zinc-600">Списать: {bonusUsed}</p>
        </div>
      )}

      <label className="mb-4 block">
        <span className="mb-1.5 block text-sm font-medium text-zinc-700">Комментарий к заказу</span>
        <textarea
          className="min-h-[88px] w-full resize-none rounded-2xl border border-zinc-900/10 bg-white/70 px-4 py-3 text-sm text-zinc-900 shadow-inner backdrop-blur-md outline-none placeholder:text-zinc-500 focus:border-zinc-900/25 focus:ring-2 focus:ring-zinc-900/10"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Пожелания по заказу…"
        />
      </label>

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 backdrop-blur-sm">
          {error}
        </div>
      )}

      {user?.loyaltyLevel && (
        <div className="mb-4 rounded-2xl border border-sky-200/80 bg-sky-50/90 px-4 py-3 text-sm text-sky-950 backdrop-blur-sm">
          После оплаты начислим кэшбэк {user.loyaltyLevel.cashbackPercent}% (≈
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
          <CreditCard className="size-5" strokeWidth={1.75} />
        )}
        {loading ? 'Оформляем…' : `Оплатить ${total} ₽`}
      </button>
    </div>
  );
}
