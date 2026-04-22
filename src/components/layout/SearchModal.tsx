"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  calories: number | null;
  category: { id: string; name: string };
}

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
    enabled: open,
  });

  const allProducts: Product[] = productsData?.products ?? [];
  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(trimmed) ||
          p.description?.toLowerCase().includes(trimmed) ||
          p.category.name.toLowerCase().includes(trimmed),
      )
    : allProducts;

  useEffect(() => {
    if (!open) return;
    setMounted(true);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
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
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open && !mounted) return null;
  if (typeof document === "undefined") return null;

  function handlePick(id: string) {
    onClose();
    router.push(`/menu/${id}`);
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
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-2 pt-[max(12px,env(safe-area-inset-top,0px))] pb-4">
        <div className="mt-2 flex items-center gap-2">
          <div className="lg-bar relative flex flex-1 items-center px-2 py-1.5">
            <Search
              className="pointer-events-none mr-3 size-[18px] shrink-0 text-[var(--lg-text-muted)]"
              strokeWidth={1.75}
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по меню…"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-[var(--lg-text)] outline-none placeholder:text-[var(--lg-text-muted)]"
              aria-label="Поиск по меню"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
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
            onClick={onClose}
            className="lg-button-icon shrink-0"
            aria-label="Закрыть поиск"
          >
            <X className="size-[1.15rem]" strokeWidth={1.75} />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto scrollbar-hide pb-4">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass-tight h-[180px] animate-pulse" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="glass-panel mt-8 px-6 py-12 text-center">
              <p className="text-lg font-semibold text-[var(--lg-text)]">
                {trimmed ? "Ничего не найдено" : "Начните вводить запрос"}
              </p>
              <p className="mt-2 text-sm text-[var(--lg-text-muted)]">
                {trimmed
                  ? "Попробуйте изменить запрос"
                  : "Поиск по названию, описанию и категории"}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(p.id)}
                    className="glass-tight lg-interactive flex w-full items-center gap-3 p-2 pr-4 text-left"
                  >
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100/30">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-2xl font-bold text-[var(--lg-text-muted)]">
                          {p.name[0]}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--lg-text)]">{p.name}</p>
                      <p className="truncate text-xs text-[var(--lg-text-muted)]">
                        {p.category.name}
                        {p.calories != null && <span> · {p.calories} ккал</span>}
                      </p>
                    </div>
                    <span className="shrink-0 text-base font-bold text-[var(--lg-text)]">{p.price} ₽</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
