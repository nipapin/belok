"use client";

import { useEffect, useRef } from "react";

export type CategoryStripItem = { id: string; name: string };

function chipClass(active: boolean) {
  return `glass-fx rounded-full px-4 py-2 h-9 flex items-center justify-center text-sm whitespace-nowrap ${active ? "border" : ""}`;
}

const stripClass = "-mx-2 flex gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide scroll-pl-3 scroll-pr-3 py-4";

type CategoryChipStripProps = {
  categories: CategoryStripItem[];
  loading: boolean;
  selectedId: string | null;
  showAllOption?: boolean;
  onSelect: (categoryId: string | null) => void;
  title?: string;
};

export default function CategoryChipStrip({
  categories,
  loading,
  selectedId,
  showAllOption = false,
  onSelect,
  title,
}: CategoryChipStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const allChipRef = useRef<HTMLButtonElement>(null);
  const categoryChipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Scroll the strip itself instead of chip.scrollIntoView(): a smooth
  // scrollIntoView here cancels the page's in-flight smooth scroll to the
  // category section (browsers allow only one scrollIntoView sequence at a time).
  function scrollStripToChip(el: HTMLButtonElement | null) {
    const strip = stripRef.current;
    if (!el || !strip) return;
    const left =
      el.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft - 12;
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }

  useEffect(() => {
    if (loading) return;
    let el: HTMLButtonElement | null = null;
    if (showAllOption) {
      el = selectedId === null ? allChipRef.current : (categoryChipRefs.current.get(selectedId) ?? null);
    } else if (selectedId !== null) {
      el = categoryChipRefs.current.get(selectedId) ?? null;
    }
    scrollStripToChip(el);
  }, [selectedId, loading, showAllOption]);

  function handleSelect(e: React.MouseEvent<HTMLButtonElement>, categoryId: string | null) {
    scrollStripToChip(e.currentTarget);
    onSelect(categoryId);
  }

  return (
    <>
      {title ? <h2 className="heading-section my-3">{title}</h2> : null}
      <div ref={stripRef} className={stripClass}>
        <span className="pointer-events-none w-0 shrink-0" aria-hidden />
        {showAllOption ? (
          <button
            ref={allChipRef}
            type="button"
            className={chipClass(selectedId === null)}
            onClick={(e) => handleSelect(e, null)}
          >
            Все
          </button>
        ) : null}
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-11 w-28 shrink-0 animate-pulse rounded-full bg-(--lg-fill)" />
            ))
          : categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={chipClass(selectedId === cat.id)}
                ref={(node) => {
                  if (node) categoryChipRefs.current.set(cat.id, node);
                  else categoryChipRefs.current.delete(cat.id);
                }}
                onClick={(e) => handleSelect(e, cat.id)}
              >
                {cat.name}
              </button>
            ))}
        <span className="pointer-events-none w-3 shrink-0" aria-hidden />
      </div>
    </>
  );
}
