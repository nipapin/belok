"use client";

import { LoaderCircle, LockKeyhole, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { resolveVariant } from "@/lib/productOptions";
import { useAuthStore } from "@/store/authStore";
import { useAuthModalStore } from "@/store/authModalStore";

interface Nutrition {
  calories: number | null;
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  fiber: number | null;
}

interface Product extends Nutrition {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  category: { id: string; name: string };
  variants?: (Partial<Nutrition> & { id: string; name: string; image: string | null; price?: number | null })[];
}

interface SearchMatch { product: Product; variantId: string | null }

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);
  const openAuth = useAuthModalStore((s) => s.openAuth);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selection, setSelection] = useState<SearchMatch[] | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequest = useRef<AbortController | null>(null);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
    enabled: open,
  });

  const allProducts: Product[] = productsData?.products ?? [];
  const trimmed = query.trim().toLowerCase();
  const literalResults = trimmed
    ? allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(trimmed) ||
          p.description?.toLowerCase().includes(trimmed) ||
          p.category.name.toLowerCase().includes(trimmed) ||
          (p.variants ?? []).some((variant) => variant.name.toLowerCase().includes(trimmed)),
      )
    : allProducts;
  const results: SearchMatch[] = aiMode ? user ? selection ?? [] : [] : literalResults.map((product) => ({
    product,
    variantId: trimmed
      ? (product.variants ?? []).find((variant) => variant.name.toLowerCase().includes(trimmed))?.id ?? null
      : null,
  }));

  function changeQuery(value: string) {
    searchRequest.current?.abort();
    searchRequest.current = null;
    setQuery(value);
    setSelection(null);
    setIsSelecting(false);
    setSearchError(null);
  }

  function changeMode(enabled: boolean) {
    changeQuery(query);
    setAiMode(enabled);
    inputRef.current?.focus();
  }

  async function selectProducts(value: string) {
    if (!user || authLoading || value.trim().length < 3) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setIsSelecting(true);
    setSearchError(null);
    setSelection(null);
    try {
      const response = await fetch("/api/products/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: value.trim() }), signal: controller.signal,
      });
      const data = await response.json();
      if (response.status === 401 && searchRequest.current === controller && !controller.signal.aborted) {
        setUser(null);
        setSelection(null);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Подбор сейчас недоступен. Можно искать по названию.");
      if (searchRequest.current === controller && !controller.signal.aborted) setSelection(data.matches);
    } catch (error) {
      if (searchRequest.current === controller && !controller.signal.aborted) {
        setSearchError(error instanceof Error ? error.message : "Не удалось подобрать блюда. Попробуйте ещё раз.");
      }
    } finally {
      if (searchRequest.current === controller) {
        searchRequest.current = null;
        setIsSelecting(false);
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      setMounted(true);
      setIsSelecting(false);
      inputRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(id);
      searchRequest.current?.abort();
      searchRequest.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setMounted(false);
        setQuery("");
        setAiMode(false);
        setSelection(null);
        setIsSelecting(false);
        setSearchError(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open && !mounted) return null;
  if (typeof document === "undefined") return null;

  function handlePick(product: Product, variantId: string | null) {
    onClose();
    const query = variantId ? `?v=${encodeURIComponent(variantId)}` : "";
    router.push(`/menu/${product.id}${query}`);
  }

  return createPortal(
    <div
      data-mobile-ui
      role="dialog"
      aria-modal="true"
      aria-label="Поиск по меню"
      className={`search-modal-backdrop fixed inset-0 z-1500 flex flex-col transition-opacity duration-200 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-2 pb-4 pt-3">
        <form className="mt-2 flex items-center gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (aiMode) void selectProducts(query);
        }}>
          <div className="lg-bar relative flex min-w-0 flex-1 items-center px-2 py-1.5">
            {aiMode ? <Sparkles
              className="pointer-events-none mr-3 size-[18px] shrink-0 text-violet-400"
              strokeWidth={1.75}
            /> : <Search
              className="pointer-events-none mr-3 size-[18px] shrink-0 text-[var(--lg-text-muted)]"
              strokeWidth={1.75}
            />}
            <input
              ref={inputRef}
              type="search"
              value={query}
              disabled={aiMode && (!user || authLoading)}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder={aiMode ? "Например, сытный обед…" : "Найти в меню…"}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-[var(--lg-text)] outline-none placeholder:text-[var(--lg-text-muted)]"
              aria-label="Поиск по меню"
              autoComplete="off"
              spellCheck={false}
              maxLength={240}
              enterKeyHint="search"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  changeQuery("");
                  inputRef.current?.focus();
                }}
                className="ml-2 rounded-full p-1 text-[var(--lg-text-muted)] transition"
                aria-label="Очистить"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => changeMode(!aiMode)}
            aria-label="AI-подбор"
            aria-pressed={aiMode}
            title={aiMode ? "Вернуться к поиску по словам" : "Подобрать блюда с AI"}
            className="search-ai-toggle flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"
          >
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden="true" />
            AI
          </button>
          <button
            type="button"
            onClick={onClose}
            className="lg-button-icon shrink-0"
            aria-label="Закрыть поиск"
          >
            <X className="size-[1.15rem]" strokeWidth={1.75} />
          </button>
        </form>

        <div className="mt-3 px-1 text-sm text-[var(--lg-text-muted)]">
          {aiMode ? <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-[var(--lg-text)]">AI-подбор</span>
              <button type="button" onClick={() => changeMode(false)} className="rounded-full px-2 py-1 underline underline-offset-4">По словам</button>
            </div>
            {user && <p>Опишите, чего хочется — подберём подходящие блюда из меню.</p>}
          </> : <p>Поиск по названию, описанию и категории. Результаты появляются сразу.</p>}
          {aiMode && !user && <div className="glass-panel mt-3 rounded-2xl p-5 text-center">
            {authLoading ? <p role="status">Проверяем вход…</p> : <>
              <LockKeyhole className="mx-auto mb-3 size-6 text-violet-400" aria-hidden="true" />
              <p className="font-semibold text-[var(--lg-text)]">AI-подбор доступен после входа</p>
              <p className="mt-2">Войдите в аккаунт, чтобы подбирать блюда по вашим пожеланиям.</p>
              <button type="button" className="lg-button-primary mt-4 min-h-11 px-5 py-2.5 text-sm font-semibold" onClick={() => {
                onClose();
                openAuth();
              }}>Войти в аккаунт</button>
            </>}
          </div>}
          {aiMode && user && !trimmed && <div className="mt-3 flex flex-wrap gap-2">
            {["Сытный обед", "Лёгкий перекус", "Вегетарианский обед"].map((example) => (
              <button key={example} type="button" className="lg-button-outline px-3 py-1.5 text-xs" onClick={() => {
                changeQuery(example);
                void selectProducts(example);
              }}>{example}</button>
            ))}
          </div>}
          {aiMode && user && <button
            type="button"
            onClick={() => void selectProducts(query)}
            disabled={authLoading || query.trim().length < 3 || isSelecting}
            className="lg-button-primary mt-3 flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {isSelecting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
            {isSelecting ? "Подбираем…" : "Подобрать блюда"}
          </button>}
          <p className="mt-2" role="status" aria-live="polite" aria-atomic="true">
            {aiMode && user && isSelecting ? "Подбираем товары из меню…" : aiMode && user && selection !== null ? `Подобрано с AI: ${selection.length}` : !aiMode && trimmed ? `Найдено по словам: ${results.length}` : ""}
          </p>
          {searchError && <p className="mt-2" role="alert">{searchError}</p>}
        </div>

        <div className="mt-4 flex-1 overflow-y-auto scrollbar-hide pb-4">
          {aiMode && !user ? null : isLoading || (isSelecting && results.length === 0) ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass-tight h-[180px] animate-pulse" />
              ))}
            </div>
          ) : aiMode && selection === null && !searchError ? null : results.length === 0 ? (
            <div className="glass-panel mt-8 px-6 py-12 text-center">
              <p className="text-lg font-semibold text-[var(--lg-text)]">
                {trimmed ? "Ничего не найдено" : "Начните вводить запрос"}
              </p>
              <p className="mt-2 text-sm text-[var(--lg-text-muted)]">
                {trimmed
                  ? aiMode ? "Попробуйте изменить условия подбора" : "Попробуйте другое слово или включите AI-подбор"
                  : "Поиск по названию, описанию и категории"}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map(({ product: p, variantId }) => {
                const variant = (p.variants ?? []).find((item) => item.id === variantId);
                const image = variant?.image ?? p.image;
                const display = resolveVariant(p, variant);
                const nutrition = [
                  { name: "Калорийность", label: "", value: display.calories, unit: "ккал" },
                  { name: "Белки", label: "Б", value: display.proteins, unit: "г" },
                  { name: "Жиры", label: "Ж", value: display.fats, unit: "г" },
                  { name: "Углеводы", label: "У", value: display.carbs, unit: "г" },
                  { name: "Клетчатка", label: "К", value: display.fiber, unit: "г" },
                ].filter((item) => item.value != null);
                return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(p, variantId)}
                    className="glass-tight lg-interactive flex w-full items-center gap-3 p-2 pr-4 text-left"
                  >
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-white">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt="" className="box-border size-full object-contain p-1" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-2xl font-bold text-[var(--lg-text-muted)]">
                          {p.name[0]}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--lg-text)]">{p.name}</p>
                      {variant && <p className="truncate text-xs text-[var(--lg-text-muted)]">{variant.name}</p>}
                      <p className="truncate text-xs text-[var(--lg-text-muted)]">
                        {p.category.name}
                      </p>
                      {nutrition.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs leading-relaxed text-[var(--lg-text-muted)]" aria-label="Пищевая ценность">
                          {nutrition.map((item) => (
                            <span key={item.name} className="whitespace-nowrap" title={item.name} aria-label={`${item.name}: ${item.value} ${item.unit}`}>
                              {item.label && `${item.label} `}{item.value} {item.unit}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-base font-bold text-[var(--lg-text)]">{display.price} ₽</span>
                  </button>
                </li>
              ); })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
