'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { brandMark } from '@/lib/brand';
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
  const [tailPad, setTailPad] = useState(0);
  const selectedCategoryRef = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const categoryHeaderRef = useRef<HTMLDivElement>(null);
  const suppressScrollSyncRef = useRef(false);
  const scrollGenRef = useRef(0);
  const suppressTimerRef = useRef<number | undefined>(undefined);
  const scrollRafRef = useRef<number | undefined>(undefined);
  selectedCategoryRef.current = selectedCategory;
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [skipEmail, setSkipEmail] = useState(false);
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

  useEffect(
    () => () => {
      window.clearTimeout(suppressTimerRef.current);
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    },
    []
  );

  const syncCategoryFromScroll = useCallback(() => {
    const root = menuRef.current;
    if (!root || suppressScrollSyncRef.current || categoriesWithProducts.length === 0) return;
    const line =
      (categoryHeaderRef.current?.getBoundingClientRect().bottom ?? root.getBoundingClientRect().top) + 1;
    let nextId = categoriesWithProducts[0].id;
    for (const category of categoriesWithProducts) {
      const section = root.querySelector<HTMLElement>(
        `[data-category-section="${CSS.escape(category.id)}"]`
      );
      if (!section) continue;
      if (section.getBoundingClientRect().top <= line) nextId = category.id;
    }
    if (nextId !== selectedCategoryRef.current) setSelectedCategory(nextId);
  }, [categoriesWithProducts]);

  const handleMenuScroll = useCallback(() => {
    if (suppressScrollSyncRef.current || scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = undefined;
      syncCategoryFromScroll();
    });
  }, [syncCategoryFromScroll]);

  const scrollToCategory = useCallback((id: string) => {
    setSelectedCategory(id);
    const root = menuRef.current;
    const section = root?.querySelector<HTMLElement>(`[data-category-section="${CSS.escape(id)}"]`);
    if (!root || !section) return;

    const headerH = categoryHeaderRef.current?.offsetHeight ?? 0;
    const top = Math.max(
      0,
      root.scrollTop + section.getBoundingClientRect().top - root.getBoundingClientRect().top - headerH
    );
    if (Math.abs(root.scrollTop - top) < 2) return;

    const gen = ++scrollGenRef.current;
    suppressScrollSyncRef.current = true;
    window.clearTimeout(suppressTimerRef.current);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });

    const release = () => {
      if (scrollGenRef.current !== gen) return;
      scrollGenRef.current += 1;
      suppressScrollSyncRef.current = false;
      root.removeEventListener('scrollend', release);
      window.clearTimeout(suppressTimerRef.current);
      syncCategoryFromScroll();
    };
    root.addEventListener('scrollend', release);
    suppressTimerRef.current = window.setTimeout(release, 1500);
  }, [syncCategoryFromScroll]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !selectedCategory) return;
    const button = nav.querySelector<HTMLElement>(`[data-category-id="${CSS.escape(selectedCategory)}"]`);
    if (!button) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = button.getBoundingClientRect();
    if (btnRect.top >= navRect.top + 4 && btnRect.bottom <= navRect.bottom - 4) return;
    const top = nav.scrollTop + btnRect.top - navRect.top - (nav.clientHeight - btnRect.height) / 2;
    nav.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [selectedCategory]);

  useLayoutEffect(() => {
    const root = menuRef.current;
    if (step !== 'menu' || !root || loadingCats || loadingProducts || categoriesWithProducts.length === 0) return;

    const measure = () => {
      const headerH = categoryHeaderRef.current?.offsetHeight ?? 0;
      const last = categoriesWithProducts[categoriesWithProducts.length - 1];
      const lastEl = root.querySelector<HTMLElement>(`[data-category-section="${CSS.escape(last.id)}"]`);
      const view = Math.max(0, root.clientHeight - headerH);
      const lastH = lastEl?.getBoundingClientRect().height ?? 0;
      const next = Math.max(0, Math.ceil(view - lastH));
      setTailPad((prev) => (prev === next ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    const last = categoriesWithProducts[categoriesWithProducts.length - 1];
    const lastEl = root.querySelector<HTMLElement>(`[data-category-section="${CSS.escape(last.id)}"]`);
    if (lastEl) observer.observe(lastEl);
    return () => observer.disconnect();
  }, [categoriesWithProducts, loadingCats, loadingProducts, step]);

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
    setSkipEmail(false);
    setSubmitError('');
    setSuccess(null);
    setOpenProductId(null);
    setStep('menu');
    if (categoriesWithProducts[0]) setSelectedCategory(categoriesWithProducts[0].id);
    menuRef.current?.scrollTo({ top: 0 });
  }

  async function placeOrder() {
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

  const activeCategory =
    categoriesWithProducts.find((category) => category.id === selectedCategory) ??
    categoriesWithProducts[0] ??
    null;
  const loadingMenu = loadingCats || loadingProducts;

  if (step === 'success' && success) {
    const title = `#${success.displayNumber}`;
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
              disabled={skipEmail}
              onChange={(e) => {
                setEmail(e.target.value);
                setSkipEmail(false);
                setSubmitError('');
              }}
            />
            <button
              type="button"
              aria-pressed={skipEmail}
              className={`min-h-14 w-full text-base ${
                skipEmail
                  ? 'inline-flex items-center justify-center rounded-full bg-(--lg-fill-active) px-4 font-semibold text-(--lg-text)'
                  : 'btn-ghost text-(--lg-text)'
              }`}
              disabled={submitting || items.length === 0}
              onClick={() => {
                setSkipEmail((value) => !value);
                setEmail('');
                setSubmitError('');
              }}
            >
              Продолжить без почты
            </button>
            {skipEmail ? (
              <p className="text-sm text-(--lg-text-muted)">Почта не нужна. Заказ отправится кнопкой внизу.</p>
            ) : null}
            {submitError ? <p className="text-sm font-medium text-red-200">{submitError}</p> : null}
          </div>
        </div>
        <div className="space-y-3 border-t border-(--lg-ring) px-4 py-4">
          <p className="text-right text-xl font-bold tabular-nums">Итого {totalPrice} ₽</p>
          <button
            type="button"
            className="btn-primary min-h-14 w-full text-lg"
            disabled={submitting || items.length === 0}
            onClick={() => void placeOrder()}
          >
            {submitting ? <Loader2 className="size-5 animate-spin" /> : 'Отправить заказ'}
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
        <nav
          ref={navRef}
          className="w-[7.5rem] shrink-0 overflow-y-auto border-r border-(--lg-ring) px-2 pb-4"
        >
          {categoriesWithProducts.map((category) => {
            const active = category.id === activeCategory?.id;
            return (
              <button
                key={category.id}
                type="button"
                data-category-id={category.id}
                aria-current={active ? 'true' : undefined}
                className={`mb-2 w-full rounded-2xl px-2 py-3 text-left text-sm font-semibold leading-tight touch-manipulation ${
                  active
                    ? 'bg-(--lg-fill-active) text-(--lg-text)'
                    : 'text-(--lg-text-muted)'
                }`}
                onClick={() => scrollToCategory(category.id)}
              >
                {category.name}
              </button>
            );
          })}
        </nav>

        <div
          ref={menuRef}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-28"
          onScroll={handleMenuScroll}
          onPointerDown={() => {
            suppressScrollSyncRef.current = false;
          }}
        >
          {loadingMenu ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <FoodCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <>
              {activeCategory ? (
                <div
                  ref={categoryHeaderRef}
                  className="sticky top-0 z-10 -mx-3 px-3 pt-1 pb-3 text-sm font-semibold text-[#18181b]"
                  style={{ backgroundColor: 'var(--pwa-chrome-top)' }}
                >
                  <p className="truncate">{activeCategory.name}</p>
                </div>
              ) : null}
              {categoriesWithProducts.map((category, categoryIndex) => {
                const categoryProducts = productsByCategory.get(category.id) ?? [];
                return (
                  <section
                    key={category.id}
                    data-category-section={category.id}
                    className="mb-3"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      {categoryProducts.map((product, index) => (
                        <KioskProductCard
                          key={product.id}
                          eager={categoryIndex === 0 && index < 4}
                          product={{
                            id: product.id,
                            name: product.name,
                            price: product.price,
                            image: product.image,
                            categoryName: category.name,
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
                  </section>
                );
              })}
              {tailPad > 0 ? <div aria-hidden style={{ height: tailPad }} /> : null}
            </>
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
