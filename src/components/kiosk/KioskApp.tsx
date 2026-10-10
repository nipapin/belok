'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Banknote, CreditCard, Loader2, Minus, Plus, QrCode, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { brandMark } from '@/lib/brand';
import { FoodCardSkeleton, type FoodCardModel } from '@/components/product/FoodCard';
import { KioskProductCard } from '@/components/kiosk/KioskProductCard';
import KioskPinPad from '@/components/kiosk/KioskPinPad';
import KioskProductModal from '@/components/kiosk/KioskProductModal';
import SbpPayPanel from '@/components/order/SbpPayPanel';
import TerminalPayPanel, { KioskReceiptStatus } from '@/components/kiosk/TerminalPayPanel';
import { useKioskCartStore } from '@/store/kioskCartStore';
import type { Category, Product } from '@/types';
import { fetchKioskCatalog, kioskCatalogRefresh } from '@/lib/kioskCatalog';

type KioskTile = FoodCardModel & { key: string; categoryName: string };

function kioskTiles(product: Product, categoryName: string): KioskTile[] {
  return [{ ...product, key: product.id, categoryName, variants: product.variants ?? [], hasOptions: product.ingredients.some((link) => link.isExtra && link.ingredient.isAvailable !== false) }];
}

type Step = 'menu' | 'checkout' | 'pay' | 'success';

type KioskPayMethod = 'CASH' | 'SBP' | 'CARD';

type PlacedOrder = {
  orderId: string;
  displayNumber: string;
  inviteSent: boolean;
  guest: boolean;
  total: number;
  email?: string;
  paymentMethod: KioskPayMethod | 'BONUS';
};

type PayOrder = PlacedOrder & {
  orderId: string;
  payload: string | null;
  image: string | null;
};

const SUCCESS_RESET_MS = 8000;
const PAYMENT_STORAGE = 'belok:kiosk:payment';
const REQUEST_STORAGE = 'belok:kiosk:request';

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const ROLL_CYCLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function RollingPrice({ value }: { value: number }) {
  const digits = String(Math.max(0, Math.floor(value))).split('');
  return (
    <span className="inline-flex items-end justify-center" aria-label={`${value} ₽`}>
      <span aria-hidden className="inline-flex">
        {digits.map((char, index) => {
          const digit = Number(char);
          const cells = [...ROLL_CYCLE, ...ROLL_CYCLE.slice(0, digit + 1)];
          return (
            <span key={`${digits.length}-${index}`} className="kiosk-odometer-digit">
              <span
                className="kiosk-odometer-strip"
                style={{
                  ['--roll' as string]: `calc(${10 + digit} * -1em)`,
                  animationDelay: `${index * 90}ms`,
                }}
              >
                {cells.map((n, cell) => (
                  <span key={cell} className="kiosk-odometer-glyph">
                    {n}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
      <span aria-hidden className="ml-[0.12em]">
        ₽
      </span>
    </span>
  );
}

function bonusWord(count: number) {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return 'баллов';
  if (last === 1) return 'балл';
  if (last >= 2 && last <= 4) return 'балла';
  return 'баллов';
}

type KioskLoyalty = {
  bonusBalance: number;
  cashbackPercent: number;
  discountPercent: number;
  levelName: string | null;
};

export default function KioskApp() {
  const [session, setSession] = useState<{ configured: boolean; unlocked: boolean; cardEnabled?:boolean } | null>(null);
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
  useLayoutEffect(()=>{selectedCategoryRef.current = selectedCategory},[selectedCategory]);
  const [openProduct, setOpenProduct] = useState<{ productId: string; variantId: string | null } | null>(null);
  const [email, setEmail] = useState('');
  const [loyalty, setLoyalty] = useState<KioskLoyalty | null>(null);
  const [redeemBonuses, setRedeemBonuses] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<KioskPayMethod>('SBP');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [recoveringOrder,setRecoveringOrder]=useState(false);
  const [payOrder, setPayOrder] = useState<PayOrder | null>(null);
  const [payFailed, setPayFailed] = useState(false);
  const payOrderRef = useRef<PayOrder | null>(null);
  const [success, setSuccess] = useState<PlacedOrder | null>(null);
  useLayoutEffect(()=>{payOrderRef.current = payOrder},[payOrder]);

  const items = useKioskCartStore((s) => s.items);
  const clearCart = useKioskCartStore((s) => s.clearCart);
  const updateQuantity = useKioskCartStore((s) => s.updateQuantity);
  const removeItem = useKioskCartStore((s) => s.removeItem);
  const getItemPrice = useKioskCartStore((s) => s.getItemPrice);
  const totalItems = useKioskCartStore((s) => s.getTotalItems());
  const totalPrice = useKioskCartStore((s) => s.getTotalPrice());

  const discountPercent = loyalty?.discountPercent ?? 0;
  const discountAmount = Math.round(totalPrice * (discountPercent / 100));
  const afterDiscount = totalPrice - discountAmount;
  const maxBonus = loyalty ? Math.min(afterDiscount, loyalty.bonusBalance) : 0;
  const bonusUsed = redeemBonuses ? maxBonus : 0;
  const payableTotal = afterDiscount - bonusUsed;
  const cashbackPercent = loyalty?.cashbackPercent ?? 0;
  const bonusToEarn =
    loyalty && cashbackPercent > 0 ? Math.round(payableTotal * (cashbackPercent / 100)) : 0;
  const bonusAfterOrder = (loyalty?.bonusBalance ?? 0) - bonusUsed + bonusToEarn;

  const { data: categoriesData, isLoading: loadingCats } = useQuery({
    queryKey: ['kiosk', 'categories'],
    queryFn: ({ signal }) => fetchKioskCatalog<{ categories: Category[] }>('/api/products/categories', signal),
    ...kioskCatalogRefresh,
    enabled: Boolean(session?.unlocked),
  });
  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['kiosk', 'products'],
    queryFn: ({ signal }) => fetchKioskCatalog<{ products: Product[] }>('/api/products', signal),
    ...kioskCatalogRefresh,
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
    const grouped = new Map<string, KioskTile[]>();
    for (const product of allProducts) {
      const categoryName =
        categories.find((category) => category.id === product.categoryId)?.name ?? '';
      const tiles = kioskTiles(product, categoryName);
      const bucket = grouped.get(product.categoryId);
      if (bucket) bucket.push(...tiles);
      else grouped.set(product.categoryId, tiles);
    }
    return grouped;
  }, [allProducts, categories]);

  const categoriesWithProducts = useMemo(
    () => categories.filter((category) => (productsByCategory.get(category.id)?.length ?? 0) > 0),
    [categories, productsByCategory]
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/kiosk/session')
      .then((r) => r.json())
      .then((json: { configured?: boolean; unlocked?: boolean; cardEnabled?:boolean }) => {
        if (cancelled) return;
        setSession({
          configured: Boolean(json.configured),
          unlocked: Boolean(json.unlocked),
          cardEnabled:Boolean(json.cardEnabled),
        });
        try {
          const saved=sessionStorage.getItem(PAYMENT_STORAGE);
          if(saved) {const pending=JSON.parse(saved) as PayOrder;if(pending.orderId){setPayOrder(pending);setStep('pay')}}
          else if(sessionStorage.getItem(REQUEST_STORAGE)) setRecoveringOrder(true);
        } catch { /* A malformed snapshot must not send another payment. */ }
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
      sessionStorage.removeItem(PAYMENT_STORAGE);
      sessionStorage.removeItem(REQUEST_STORAGE);
      useKioskCartStore.getState().clearCart();
      setEmail('');
      setLoyalty(null);
      setRedeemBonuses(false);
      setPaymentMethod('SBP');
      setSubmitError('');
      setPayOrder(null);
      setPayFailed(false);
      setSuccess(null);
      setOpenProduct(null);
      setStep('menu');
    }, SUCCESS_RESET_MS);
    return () => window.clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (step !== 'checkout') return;
    const trimmed = email.trim();
    if (!trimmed || !emailLooksValid(trimmed)) {
      setLoyalty(null);
      setRedeemBonuses(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/kiosk/loyalty?email=${encodeURIComponent(trimmed)}`)
      .then((response) => response.json())
      .then(
        (json: {
          found?: boolean;
          bonusBalance?: number;
          cashbackPercent?: number;
          discountPercent?: number;
          levelName?: string | null;
        }) => {
          if (cancelled) return;
          if (!json.found) {
            setLoyalty(null);
            setRedeemBonuses(false);
            return;
          }
          setLoyalty({
            bonusBalance: Math.floor(json.bonusBalance ?? 0),
            cashbackPercent: Number(json.cashbackPercent) || 0,
            discountPercent: Number(json.discountPercent) || 0,
            levelName: json.levelName ?? null,
          });
        }
      )
      .catch(() => {
        if (!cancelled) {
          setLoyalty(null);
          setRedeemBonuses(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [step, email]);

  useEffect(() => {
    if (!loyalty || maxBonus <= 0) setRedeemBonuses(false);
  }, [loyalty, maxBonus]);

  function resetGuest() {
    sessionStorage.removeItem(PAYMENT_STORAGE);
    sessionStorage.removeItem(REQUEST_STORAGE);
    clearCart();
    setEmail('');
    setLoyalty(null);
    setRedeemBonuses(false);
    setPaymentMethod('SBP');
    setSubmitError('');
    setPayOrder(null);
    setPayFailed(false);
    setSuccess(null);
    setOpenProduct(null);
    setStep('menu');
    if (categoriesWithProducts[0]) setSelectedCategory(categoriesWithProducts[0].id);
    menuRef.current?.scrollTo({ top: 0 });
  }

  const handlePayStatus = useCallback(
    (status: string) => {
      if (status === 'CANCELLED') {
        setPayFailed(true);
        return;
      }
      if (status !== 'SUCCEEDED') return;
      const current = payOrderRef.current;
      if (!current) return;
      payOrderRef.current = null;
      setSuccess({
        orderId:current.orderId,
        displayNumber: current.displayNumber,
        inviteSent: current.inviteSent,
        guest: current.guest,
        total: current.total,
        email: current.email,
        paymentMethod: current.paymentMethod,
      });
      clearCart();
      sessionStorage.removeItem(PAYMENT_STORAGE);
      sessionStorage.removeItem(REQUEST_STORAGE);
      setPayOrder(null);
      setStep('success');
    },
    [clearCart]
  );

  async function placeOrder() {
    if ((items.length === 0 && !sessionStorage.getItem(REQUEST_STORAGE)) || submitting) return;
    const trimmed = email.trim();
    if (trimmed && !emailLooksValid(trimmed)) {
      setSubmitError('Некорректный email');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const requestBody = sessionStorage.getItem(REQUEST_STORAGE) || JSON.stringify({
          requestId:crypto.randomUUID(),
          email: trimmed || null,
          paymentMethod: payableTotal > 0 ? paymentMethod : 'BONUS',
          bonusUsed,
          items: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
            customizations: item.customizations.map((c) => ({
              ingredientId: c.ingredientId,
              action: c.action,
              priceDelta: c.priceDelta,
            })),
          })),
        });
      sessionStorage.setItem(REQUEST_STORAGE,requestBody);
      const res = await fetch('/api/kiosk/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body:requestBody,
      });
      const json = (await res.json()) as {
        error?: string;
        cancelled?: boolean;
        notCreated?: boolean;
        order?: { id: string; total: number;paymentMethod?:KioskPayMethod|'BONUS' };
        inviteSent?: boolean;
        guest?: boolean;
        displayNumber?: string;
        payment?: { method?:KioskPayMethod;paymentUrl?: string | null; payload?: string | null; image?: string | null } | null;
      };
      if (!res.ok) {
        if(res.status===400 || json.cancelled || json.notCreated) {sessionStorage.removeItem(REQUEST_STORAGE);setRecoveringOrder(false)}
        else setRecoveringOrder(true);
        setSubmitError(json.error || 'Не удалось отправить заказ');
        return;
      }
      const id = json.order?.id ?? '';
      const placed: PlacedOrder = {
        orderId:id,
        displayNumber: json.displayNumber || id.slice(0, 8),
        inviteSent: Boolean(json.inviteSent),
        guest: Boolean(json.guest),
        total: json.order?.total ?? payableTotal,
        email: (JSON.parse(requestBody) as {email?:string}).email || undefined,
        paymentMethod: json.order?.paymentMethod ?? json.payment?.method ?? paymentMethod,
      };
      if (json.payment) {
        const pending:PayOrder = {
          ...placed,
          orderId: id,
          payload: json.payment.payload ?? null,
          image: json.payment.image ?? null,
        };
        sessionStorage.setItem(PAYMENT_STORAGE,JSON.stringify(pending));
        sessionStorage.removeItem(REQUEST_STORAGE);
        setPayOrder(pending);
        setRecoveringOrder(false);
        setPayFailed(false);
        setStep('pay');
        return;
      }
      clearCart();
      sessionStorage.removeItem(REQUEST_STORAGE);
      setRecoveringOrder(false);
      setSuccess(placed);
      setStep('success');
    } catch {
      setRecoveringOrder(true);
      setSubmitError('Нет подтверждения от сервера. Повторите отправку — будет восстановлен тот же заказ.');
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
        onUnlocked={() => { setSession({ configured: true, unlocked: true }); void fetch('/api/kiosk/session').then(r=>r.json()).then(setSession); }}
      />
    );
  }

  if(recoveringOrder) return <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center"><h1 className="text-2xl font-semibold">Уточняем состояние заказа</h1><p>Запрос уже отправлен. Восстановите тот же заказ перед следующей оплатой.</p>{submitError ? <p role="alert">{submitError}</p> : null}<button className="btn-primary" disabled={submitting} onClick={placeOrder}>{submitting ? 'Проверяем…' : 'Восстановить заказ'}</button></div>;

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
        <p className="mt-1 text-sm font-medium text-(--lg-text-muted)">
          {success.paymentMethod === 'CASH' ? 'Оплата наличными' : 'Оплачено'}
        </p>
        {['CARD','SBP'].includes(success.paymentMethod) ? <KioskReceiptStatus orderId={success.orderId} /> : null}
        {success.inviteSent ? (
          <p className="mt-4 max-w-md text-base text-(--lg-text-muted)">
            На {success.email} отправили ссылку для создания аккаунта — баллы и история появятся после регистрации.
          </p>
        ) : success.email && !success.guest ? (
          <p className="mt-4 max-w-md text-base text-(--lg-text-muted)">
            {success.paymentMethod === 'CASH'
              ? 'Заказ сохранён в аккаунте. Оплатите наличными. Баллы начислятся после выдачи.'
              : 'Заказ оплачен и сохранён в аккаунте. Баллы начислятся после выдачи.'}
          </p>
        ) : (
          <p className="mt-4 max-w-md text-base text-(--lg-text-muted)">
            {success.paymentMethod === 'CASH'
              ? 'Заказ принят. Подойдите к кассиру, назовите номер заказа и оплатите наличными.'
              : 'Оплата прошла. Назовите номер заказа при получении.'}
          </p>
        )}
        <button type="button" className="btn-primary mt-8 min-h-14 px-8 text-lg" onClick={resetGuest}>
          Новый гость
        </button>
      </div>
    );
  }

  if (step === 'pay' && payOrder) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="px-4 pt-6 pb-2 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-(--lg-text-muted)">
            Заказ #{payOrder.displayNumber}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{payOrder.total} ₽</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <div className="mx-auto w-full max-w-md">
            {payOrder.paymentMethod === 'CARD' ? <TerminalPayPanel orderId={payOrder.orderId} onStatus={handlePayStatus} /> : <SbpPayPanel
              orderId={payOrder.orderId}
              statusUrl={`/api/kiosk/orders/${payOrder.orderId}/payment`}
              initialPayload={payOrder.payload}
              initialImage={payOrder.image}
              onStatus={handlePayStatus}
              showBankLink={false}
              qrPx={352}
              hint="Отсканируйте QR в приложении банка. Статус обновится сам."
              cancelledMessage="Оплата не прошла или время QR истекло. Заказ отменён."
            />}
          </div>
        </div>
        <div className="space-y-3 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {payFailed ? (
            <button
              type="button"
              className="btn-primary min-h-14 w-full text-lg"
              onClick={() => {
                setPayFailed(false);
                setPayOrder(null);
                sessionStorage.removeItem(PAYMENT_STORAGE);
                setStep('checkout');
              }}
            >
              Вернуться к заказу
            </button>
          ) : null}
          {payOrder.paymentMethod !== 'CARD' || payFailed ? <button type="button" className="btn-ghost min-h-14 w-full text-lg" onClick={resetGuest}>
            Новый гость
          </button> : null}
        </div>
      </div>
    );
  }

  if (step === 'checkout') {
    const orderList = (
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
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-3 px-4 py-3">
            <button
              type="button"
              className="btn-icon size-12"
              onClick={() => {
                setSubmitError('');
                setStep('menu');
              }}
              aria-label="Назад к меню"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="text-xl font-semibold">Ваш заказ</h1>
          </header>
          <div className="shrink-0 px-4 pt-1 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-[#18181b]">Итого</p>
            <p className="mt-1 text-[clamp(3.25rem,10vw,5.5rem)] leading-none font-bold text-[#18181b] tabular-nums">
              <RollingPrice key={payableTotal} value={payableTotal} />
            </p>
            {discountAmount > 0 || bonusUsed > 0 ? (
              <p className="mt-2 text-sm font-medium text-(--lg-text-muted)">
                {discountAmount > 0 ? (
                  <span>
                    Скидка {discountPercent}%
                    {loyalty?.levelName ? ` · ${loyalty.levelName}` : ''}: −{discountAmount} ₽
                  </span>
                ) : null}
                {discountAmount > 0 && bonusUsed > 0 ? <span> · </span> : null}
                {bonusUsed > 0 ? <span>Бонусы: −{bonusUsed} ₽</span> : null}
              </p>
            ) : null}
            <input
              className="input-pill mt-3 min-h-14 w-full text-lg"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Почта для баллов"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSubmitError('');
              }}
            />
            {submitError ? <p className="mt-2 text-sm font-medium text-red-200">{submitError}</p> : null}
            {loyalty ? (
              <div className="kiosk-rise mt-3 space-y-2">
                <p className="text-2xl font-semibold text-[#18181b] tabular-nums">
                  {loyalty.bonusBalance - bonusUsed} + {bonusToEarn} {bonusWord(bonusToEarn)}
                </p>
                <p className="text-sm text-(--lg-text-muted)">
                  {bonusUsed > 0
                    ? `Спишем ${bonusUsed} · после заказа останется ${bonusAfterOrder}`
                    : `На счёте ${loyalty.bonusBalance} · после заказа ${bonusAfterOrder}`}
                </p>
                {maxBonus > 0 ? (
                  <button
                    type="button"
                    className={`${redeemBonuses ? 'btn-primary' : 'btn-outline'} mx-auto min-h-12 px-6 text-base`}
                    onClick={() => {
                      setRedeemBonuses((prev) => !prev);
                      setSubmitError('');
                    }}
                  >
                    {redeemBonuses ? 'Отменить списание' : `Списать ${maxBonus} ${bonusWord(maxBonus)}`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div
            className="kiosk-rise mt-3 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4"
            style={{ animationDelay: '80ms' }}
          >
            {orderList}
          </div>
          {payableTotal > 0 ? (
            <div className="mt-3 grid shrink-0 grid-cols-3 gap-3 px-3">
              <button
                type="button"
                className={`kiosk-rise ${paymentMethod === 'CASH' ? 'btn-primary' : 'btn-outline'} aspect-square w-full flex-col gap-4 !rounded-3xl text-3xl`}
                style={{ animationDelay: '200ms' }}
                onClick={() => {
                  setPaymentMethod('CASH');
                  setSubmitError('');
                }}
              >
                <Banknote className="size-16" strokeWidth={1.75} />
                <span className="w-full text-center">Наличные</span>
              </button>
              <button
                type="button"
                className={`kiosk-rise ${paymentMethod === 'CARD' ? 'btn-primary' : 'btn-outline'} aspect-square w-full flex-col gap-4 !rounded-3xl text-3xl disabled:opacity-40`}
                style={{ animationDelay: '240ms' }}
                disabled={!session.cardEnabled}
                title={!session.cardEnabled ? 'Оплата картой временно недоступна' : undefined}
                onClick={() => {
                  setPaymentMethod('CARD');
                  setSubmitError('');
                }}
              >
                <CreditCard className="size-16" strokeWidth={1.75} />
                <span className="w-full text-center">Карта</span>
              </button>
              <button
                type="button"
                className={`kiosk-rise ${paymentMethod === 'SBP' ? 'btn-primary' : 'btn-outline'} aspect-square w-full flex-col gap-4 !rounded-3xl text-3xl`}
                style={{ animationDelay: '280ms' }}
                onClick={() => {
                  setPaymentMethod('SBP');
                  setSubmitError('');
                }}
              >
                <QrCode className="size-16" strokeWidth={1.75} />
                <span className="w-full text-center">СБП</span>
              </button>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="w-full shrink-0 px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              className="kiosk-rise btn-primary min-h-28 w-full text-2xl"
              style={{ animationDelay: '380ms' }}
              disabled={submitting || items.length === 0}
              onClick={() => void placeOrder()}
            >
              {submitting ? <Loader2 className="size-6 animate-spin" /> : 'Отправить заказ'}
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
                          key={product.key}
                          eager={categoryIndex === 0 && index < 4}
                          product={{
                            id: product.id,
                            variants: product.variants,
                            hasOptions: product.hasOptions,
                            name: product.name,
                            price: product.price,
                            image: product.image,
                            categoryName: product.categoryName,
                            createdAt: product.createdAt,
                            calories: product.calories,
                            proteins: product.proteins,
                            fats: product.fats,
                            carbs: product.carbs,
                            weightGrams: product.weightGrams,
                            spicinessLevel: product.spicinessLevel,
                          }}
                          onOpen={(variantId) =>
                            setOpenProduct({ productId: product.id, variantId })
                          }
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
          onClick={() => {
            setSubmitError('');
            setStep('checkout');
          }}
        >
          <span>К заказу · {totalItems} шт.</span>
          <span className="tabular-nums">{totalPrice} ₽</span>
        </button>
      </div>

      {openProduct ? (
        <KioskProductModal
          productId={openProduct.productId}
          variantId={openProduct.variantId}
          onClose={() => setOpenProduct(null)}
        />
      ) : null}
    </div>
  );
}
