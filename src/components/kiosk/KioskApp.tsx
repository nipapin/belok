'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { brandMark } from '@/lib/brand';
import { formatGuestOrderNumber } from '@/lib/orderCustomer';
import { FoodCardSkeleton } from '@/components/product/FoodCard';
import { KioskProductCard } from '@/components/kiosk/KioskProductCard';
import KioskPinPad from '@/components/kiosk/KioskPinPad';
import KioskProductModal from '@/components/kiosk/KioskProductModal';
import { useKioskCartStore } from '@/store/kioskCartStore';
import type { Category, Product } from '@/types';

type Step = 'menu' | 'checkout' | 'success';

const SUCCESS_RESET_MS = 8000;

export default function KioskApp() {
  const [session, setSession] = useState<{ configured: boolean; unlocked: boolean } | null>(null);
  const [step, setStep] = useState<Step>('menu');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState<{
    displayNumber: string;
    inviteSent: boolean;
    guest: boolean;
    total: number;
    email?: string;
  } | null>(null);

  const items = useKioskCartStore((s) => s.items);
  const clearCart = useKioskCartStore((s) => s.clearCart);
  const updateQuantity = useKioskCartStore((s) => s.updateQuantity);
  const removeItem = useKioskCartStore((s) => s.removeItem);
  const getItemPrice = useKioskCartStore((s) => s.getItemPrice);
  const totalItems = useKioskCartStore((s) => s.getTotalItems());
  const totalPrice = useKioskCartStore((s) => s.getTotalPrice());

  const { data: categoriesData, isLoading: loadingCats } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/products/categories').then((r) => r.json()),
    enabled: Boolean(session?.unlocked),
  });
  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetch('/api/products').then((r) => r.json()),
    enabled: Boolean(session?.unlocked),
  });

  const categories: Category[] = useMemo(
    () => categoriesData?.categories ?? [],
    [categoriesData]
  );
  const allProducts: Product[] = useMemo(
    () => productsData?.products ?? [],
    [productsData]
  );

  const productsByCategory = useMemo(() => {
    const grouped = new Map<string, Product[]>();
    for (const product of allProducts) {
      const bucket = grouped.get(product.categoryId);
      if (bucket) bucket.push(product);
      else grouped.set(product.categoryId, [product]);
    }
    return grouped;
  }, [allProducts]);

  const categoriesWithProducts = useMemo(
    () => categories.filter((category) => (productsByCategory.get(category.id)?.length ?? 0) > 0),
    [categories, productsByCategory]
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/kiosk/session')
      .then((r) => r.json())
      .then((json: { configured?: boolean; unlocked?: boolean }) => {
        if (cancelled) return;
        setSession({
          configured: Boolean(json.configured),
          unlocked: Boolean(json.unlocked),
        });
      })
      .catch(() => {
        if (!cancelled) setSession({ configured: false, unlocked: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedCategory) return;
    if (categoriesWithProducts.length === 0) return;
    setSelectedCategory(categoriesWithProducts[0].id);
  }, [categoriesWithProducts, selectedCategory]);

  useEffect(() => {
    if (step !== 'success') return;
    const t = window.setTimeout(() => {
      useKioskCartStore.getState().clearCart();
      setEmail('');
      setSubmitError('');
      setSuccess(null);
      setOpenProductId(null);
      setStep('menu');
    }, SUCCESS_RESET_MS);
    return () => window.clearTimeout(t);
  }, [step]);

  function resetGuest() {
    clearCart();
    setEmail('');
    setSubmitError('');
    setSuccess(null);
    setOpenProductId(null);
    setStep('menu');
    if (categoriesWithProducts[0]) setSelectedCategory(categoriesWithProducts[0].id);
  }

  async function placeOrder(skipEmail: boolean) {
    if (items.length === 0 || submitting) return;
    const trimmed = email.trim();
    if (!skipEmail && !trimmed) {
      setSubmitError('Введите почту или продолжите без неё');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/kiosk/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: skipEmail ? null : trimmed,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            customizations: item.customizations.map((c) => ({
              ingredientId: c.ingredientId,
              action: c.action,
              priceDelta: c.priceDelta,
            })),
          })),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        order?: { id: string; total: number };
        inviteSent?: boolean;
        guest?: boolean;
        displayNumber?: string;
      };
      if (!res.ok) {
        setSubmitError(json.error || 'Не удалось отправить заказ');
        return;
      }
      const id = json.order?.id ?? '';
      setSuccess({
        displayNumber: json.displayNumber || id.slice(0, 8),
        inviteSent: Boolean(json.inviteSent),
        guest: Boolean(json.guest),
        total: json.order?.total ?? totalPrice,
        email: skipEmail ? undefined : trimmed,
      });
      clearCart();
      setStep('success');
    } catch {
      setSubmitError('Нет соединения');
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-(--lg-text)" />
      </div>
    );
  }

  if (!session.unlocked) {
    return (
      <KioskPinPad
        configured={session.configured}
        onUnlocked={() => setSession({ configured: true, unlocked: true })}
      />
    );
  }

  const visibleProducts = selectedCategory
    ? (productsByCategory.get(selectedCategory) ?? [])
    : allProducts;
  const loadingMenu = loadingCats || loadingProducts;

  if (step === 'success' && success) {
    const title =
      success.guest && !success.email
        ? formatGuestOrderNumber(success.displayNumber)
        : `Заказ №${success.displayNumber}`;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-(--lg-text-muted)">Заказ принят</p>
        <h1 className="mt-3 text-4xl font-semibold text-(--lg-text)">{title}</h1>
        <p className="mt-3 text-2xl font-bold tabular-nums">{success.total} ₽</p>
        {success.inviteSent ? (
          <p className="mt-4 max-w-md text-base text-(--lg-text-muted)">
            На {success.email} отправили ссылку для создания аккаунта — баллы и история появятся после регистрации.
          </p>
        ) : success.email && !success.guest ? (
          <p className="mt-4 max-w-md text-base text-(--lg-text-muted)">
            Заказ сохранён в аккаунте. Баллы начислятся после выдачи.
          </p>
        ) : (
          <p className="mt-4 max-w-md text-base text-(--lg-text-muted)">
            Назовите номер заказа на кассе.
          </p>
        )}
        <button type="button" className="btn-primary mt-8 min-h-14 px-8 text-lg" onClick={resetGuest}>
          Новый гость
        </button>
      </div>
    );
  }

  if (step === 'checkout') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-3 px-4 py-3">
          <button type="button" className="btn-icon size-12" onClick={() => setStep('menu')} aria-label="Назад к меню">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-xl font-semibold">Ваш заказ</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="glass-panel flex items-center gap-3 p-3">
                <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-white">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="box-border h-full w-full object-contain p-1" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  {item.customizations.length > 0 ? (
                    <p className="truncate text-xs text-(--lg-text-muted)">
                      {item.customizations
                        .map((c) => (c.action === 'ADD' ? `+ ${c.ingredientName}` : `без ${c.ingredientName}`))
                        .join(', ')}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold tabular-nums">{getItemPrice(item)} ₽</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn-icon size-11"
                    onClick={() =>
                      item.quantity <= 1 ? removeItem(item.id) : updateQuantity(item.id, item.quantity - 1)
                    }
                    aria-label="Меньше"
                  >
                    {item.quantity <= 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                  </button>
                  <span className="min-w-8 text-center text-lg font-bold tabular-nums">{item.quantity}</span>
                  <button
                    type="button"
                    className="btn-icon size-11"
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    aria-label="Больше"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="glass-panel mt-6 space-y-3 p-4">
            <h2 className="text-lg font-semibold">Почта для баллов</h2>
            <p className="text-sm text-(--lg-text-muted)">
              Если есть аккаунт — заказ попадёт в историю. Если нет — пришлём приглашение. Можно отказаться.
            </p>
            <input
              className="input-pill min-h-14 text-lg"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="email@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSubmitError('');
              }}
            />
            {submitError ? <p className="text-sm font-medium text-red-200">{submitError}</p> : null}
          </div>
        </div>
        <div className="space-y-3 border-t border-(--lg-ring) px-4 py-4">
          <p className="text-right text-xl font-bold tabular-nums">Итого {totalPrice} ₽</p>
          <button
            type="button"
            className="btn-primary min-h-14 w-full text-lg"
            disabled={submitting || items.length === 0}
            onClick={() => void placeOrder(false)}
          >
            {submitting ? <Loader2 className="size-5 animate-spin" /> : 'Отправить заказ'}
          </button>
          <button
            type="button"
            className="btn-ghost min-h-12 w-full text-base"
            disabled={submitting || items.length === 0}
            onClick={() => void placeOrder(true)}
          >
            Продолжить без почты
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <h1 className="text-2xl font-semibold tracking-tight">{brandMark}</h1>
        <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={resetGuest}>
          Новый гость
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-[7.5rem] shrink-0 overflow-y-auto border-r border-(--lg-ring) px-2 pb-4">
          {categoriesWithProducts.map((category) => {
            const active = category.id === selectedCategory;
            return (
              <button
                key={category.id}
                type="button"
                className={`mb-2 w-full rounded-2xl px-2 py-3 text-left text-sm font-semibold leading-tight touch-manipulation ${
                  active
                    ? 'bg-(--lg-fill-active) text-(--lg-text)'
                    : 'text-(--lg-text-muted)'
                }`}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 pb-28">
          {loadingMenu ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <FoodCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {visibleProducts.map((product, index) => (
                <KioskProductCard
                  key={product.id}
                  eager={index < 4}
                  product={{
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    image: product.image,
                    categoryName: product.category?.name,
                    createdAt: product.createdAt,
                    calories: product.calories,
                    proteins: product.proteins,
                    fats: product.fats,
                    carbs: product.carbs,
                    weightGrams: product.weightGrams,
                  }}
                  onOpen={() => setOpenProductId(product.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="btn-primary flex min-h-16 w-full items-center justify-between px-5 text-lg shadow-lg disabled:opacity-50"
          disabled={totalItems === 0}
          onClick={() => setStep('checkout')}
        >
          <span>К заказу · {totalItems} шт.</span>
          <span className="tabular-nums">{totalPrice} ₽</span>
        </button>
      </div>

      {openProductId ? (
        <KioskProductModal productId={openProductId} onClose={() => setOpenProductId(null)} />
      ) : null}
    </div>
  );
}
