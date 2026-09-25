'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, Bike, Check, Loader2, QrCode, Store } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useHaptic } from '@/hooks/useHaptic';
import EffortSlider from '@/components/ui/EffortSlider';
import PhoneField from '@/components/checkout/PhoneField';
import DeliveryTimePicker, { ASAP_TIME } from '@/components/checkout/DeliveryTimePicker';
import KaliningradAddressField from '@/components/checkout/KaliningradAddressField';
import { formatRuPhoneMask } from '@/lib/phone';
import type { OrderFulfillment, OrderPaymentMethod } from '@/lib/types';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotalPrice, clearCart, getItemPrice } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const haptic = useHaptic();

  const [fulfillment, setFulfillment] = useState<OrderFulfillment>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryTime, setDeliveryTime] = useState(ASAP_TIME);
  const [contactPhone, setContactPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<Extract<OrderPaymentMethod, 'CASH' | 'SBP'>>('SBP');
  const [bonusUsed, setBonusUsed] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [error, setError] = useState('');
  const actionRef = useRef<HTMLDivElement>(null);
  const [actionPad, setActionPad] = useState(76);

  const subtotal = getTotalPrice();
  const discountPercent = user?.loyaltyLevel?.discountPercent || 0;
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const afterDiscount = subtotal - discountAmount;
  const maxBonus = Math.min(afterDiscount, user?.bonusBalance || 0);
  const total = afterDiscount - bonusUsed;

  useEffect(() => {
    if (!user?.phone) return;
    const formatted = formatRuPhoneMask(user.phone);
    if (!formatted) return;
    setContactPhone((prev) => (prev.replace(/\D/g, '').length >= 11 ? prev : formatted));
  }, [user?.phone]);

  useEffect(() => {
    if (items.length === 0 && !orderPlaced && !loading) {
      router.replace('/cart');
    }
  }, [items.length, orderPlaced, loading, router]);

  const formVisible = items.length > 0 && !orderPlaced;

  useEffect(() => {
    const node = actionRef.current;
    if (!formVisible || !node) return;
    const root = document.documentElement;
    const gap = 24;
    const apply = () => {
      const height = node.offsetHeight;
      setActionPad(height + gap);
      root.style.setProperty('--client-bottom-action', `${height}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--client-bottom-action');
    };
  }, [formVisible]);

  useEffect(() => {
    if (!error) return;
    const scroller = actionRef.current?.closest('main');
    if (!scroller) return;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, actionPad]);

  const handleOrder = async () => {
    setError('');
    if (!fulfillment) {
      setError('Выберите доставку или самовывоз');
      return;
    }
    if (fulfillment === 'DELIVERY') {
      if (deliveryAddress.trim().length < 5) {
        setError('Укажите адрес доставки');
        return;
      }
      if (!deliveryTime) {
        setError('Укажите время доставки');
        return;
      }
      if (contactPhone.replace(/\D/g, '').length < 10) {
        setError('Укажите телефон для связи');
        return;
      }
    }
    if (paymentMethod === 'SBP' && total > 0 && total < 10) {
      setError('Онлайн-оплата принимает платежи от 10 ₽. Спишите бонусы или добавьте товары.');
      return;
    }
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
        body: JSON.stringify({
          items: orderItems,
          bonusUsed,
          comment,
          fulfillment,
          deliveryAddress,
          deliveryTime,
          contactPhone,
          paymentMethod: total > 0 ? paymentMethod : 'BONUS',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        haptic('error');
        setError(data.error || 'Не удалось оформить заказ');
        return;
      }

      haptic('success');
      setOrderPlaced(true);
      clearCart();
      const payUrl = data.payment?.paymentUrl || data.payment?.payload;
      if (typeof payUrl === 'string' && payUrl) {
        window.location.assign(payUrl);
        return;
      }
      router.replace(`/orders/${data.order.id}`);
    } catch {
      haptic('error');
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0 && orderPlaced) {
    return (
      <div className="flex justify-center pt-16">
        <Loader2 className="size-6 animate-spin text-(--lg-text-muted)" />
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  const inputClass =
    'w-full rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-4 py-3 text-sm text-(--lg-text) outline-none placeholder:text-(--lg-text-muted) focus:border-(--lg-ring-strong) focus:ring-2 focus:ring-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]';

  const choiceClass = (active: boolean) =>
    `${active ? 'btn-primary' : 'btn-outline'} flex-1 flex-col !rounded-[calc(1.75rem/1.618)] py-3.5`;

  return (
    <div className="mx-auto max-w-md px-2 pt-2" style={{ paddingBottom: actionPad }}>
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
        {user && maxBonus > 0 && (
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
        {user?.loyaltyLevel && (
          <p className="mt-3 text-sm leading-snug text-(--lg-text-muted)">
            После выполнения заказа начислим кэшбэк {user.loyaltyLevel.cashbackPercent}% (≈
            {Math.round(total * (user.loyaltyLevel.cashbackPercent / 100))} бонусов)
          </p>
        )}
      </div>

      {user && maxBonus > 0 && (
        <div className="mb-6">
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
        </div>
      )}

      <div className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-(--lg-text)">Как получить</h2>
        <div className="flex gap-2">
          <button type="button" className={choiceClass(fulfillment === 'PICKUP')} onClick={() => setFulfillment('PICKUP')}>
            <Store className="size-5" strokeWidth={1.75} />
            Самовывоз
          </button>
          <button type="button" className={choiceClass(fulfillment === 'DELIVERY')} onClick={() => setFulfillment('DELIVERY')}>
            <Bike className="size-5" strokeWidth={1.75} />
            Доставка
          </button>
        </div>
        {fulfillment === 'DELIVERY' && (
          <div className="mt-4 space-y-3">
            <KaliningradAddressField value={deliveryAddress} onChange={setDeliveryAddress} />
            <DeliveryTimePicker value={deliveryTime} onChange={setDeliveryTime} />
            <PhoneField value={contactPhone} onChange={setContactPhone} />
          </div>
        )}
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-sm font-medium text-(--lg-text)">Комментарий к заказу</span>
        <textarea
          className={`min-h-[88px] resize-none ${inputClass}`}
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Пожелания по заказу…"
        />
      </label>

      {total > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-base font-semibold text-(--lg-text)">Оплата</h2>
          <div className="grid grid-cols-2 items-start gap-2">
            <div className="min-w-0">
              <button
                type="button"
                className={`${choiceClass(paymentMethod === 'CASH')} w-full`}
                onClick={() => setPaymentMethod('CASH')}
              >
                <Banknote className="size-5" strokeWidth={1.75} />
                Наличными
              </button>
              {paymentMethod === 'CASH' && (
                <p className="mt-2 rounded-md bg-(--lg-fill) px-2.5 py-1 text-center text-xs text-(--lg-text-muted) ring-1 ring-(--lg-ring)">
                  Возможен перевод
                </p>
              )}
            </div>
            <button
              type="button"
              className={`${choiceClass(paymentMethod === 'SBP')} w-full`}
              onClick={() => setPaymentMethod('SBP')}
            >
              <QrCode className="size-5" strokeWidth={1.75} />
              СБП
            </button>
          </div>
        </div>
      )}

      <div
        ref={actionRef}
        className="fixed inset-x-0 z-30 px-4"
        style={{ bottom: 'var(--client-nav-clearance)' }}
      >
        <div className="mx-auto max-w-md px-2">
          {error && (
            <div className="mb-2 rounded-2xl border border-rose-400/35 bg-rose-500/18 px-3 py-3 text-sm text-(--lg-text)">
              {error}
            </div>
          )}
          {paymentMethod === 'SBP' && total > 0 && total < 10 && (
            <p className="mb-2 text-center text-sm text-(--lg-text-muted)">
              Онлайн-оплата от 10 ₽. Спишите бонусы или добавьте товары.
            </p>
          )}
          <button
            type="button"
            className="btn-primary w-full py-3.5 shadow-lg"
            onClick={handleOrder}
            disabled={loading || (paymentMethod === 'SBP' && total > 0 && total < 10)}
          >
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : total === 0 ? (
              <Check className="size-5" strokeWidth={1.75} />
            ) : paymentMethod === 'CASH' ? (
              <Banknote className="size-5" strokeWidth={1.75} />
            ) : (
              <QrCode className="size-5" strokeWidth={1.75} />
            )}
            {loading
              ? 'Оформляем…'
              : total === 0
                ? `Оформить заказ · ${total} ₽`
                : paymentMethod === 'CASH'
                  ? `Оформить заказ · ${total} ₽`
                  : `Оплатить через СБП · ${total} ₽`}
          </button>
        </div>
      </div>
    </div>
  );
}
