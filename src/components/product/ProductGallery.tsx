'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type GallerySlide = {
  key: string;
  image: string | null;
  alt: string;
  fallback: string;
};

type ProductGalleryProps = {
  slides: GallerySlide[];
  index: number;
  onIndex: (index: number) => void;
};

export default function ProductGallery({ slides, index, onIndex }: ProductGalleryProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const choosable = slides.length > 1;
  const safeIndex = slides.length === 0 ? 0 : Math.min(index, slides.length - 1);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !choosable) return;
    const left = safeIndex * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) <= 2) return;
    programmatic.current = true;
    el.scrollTo({ left, behavior: 'smooth' });
  }, [choosable, safeIndex]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const left = safeIndex * el.clientWidth;
    if (programmatic.current) {
      if (Math.abs(el.scrollLeft - left) <= 2) programmatic.current = false;
      return;
    }
    const next = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.min(slides.length - 1, Math.max(0, next));
    if (clamped !== safeIndex) onIndex(clamped);
  }

  function step(delta: number) {
    onIndex((safeIndex + delta + slides.length) % slides.length);
  }

  return (
    <div className="relative aspect-square w-full bg-white">
      <div
        ref={scrollerRef}
        onScroll={choosable ? onScroll : undefined}
        className={
          choosable
            ? 'absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'absolute inset-0 overflow-hidden'
        }
      >
        {slides.map((slide) => (
          <div key={slide.key} className="relative h-full min-w-full shrink-0 basis-full snap-center">
            {slide.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.image}
                alt={slide.alt}
                className="absolute inset-0 box-border size-full object-contain object-center p-4"
                draggable={false}
              />
            ) : (
              <span className="flex size-full items-center justify-center text-[6rem] font-bold leading-none text-slate-400">
                {slide.fallback}
              </span>
            )}
          </div>
        ))}
      </div>
      {choosable ? (
        <>
          <button
            type="button"
            className="btn-icon glass-fx absolute top-1/2 left-4 z-10 -translate-y-1/2"
            aria-label="Предыдущий вкус"
            onClick={() => step(-1)}
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="btn-icon glass-fx absolute top-1/2 right-4 z-10 -translate-y-1/2"
            aria-label="Следующий вкус"
            onClick={() => step(1)}
          >
            <ChevronRight className="size-5" strokeWidth={1.75} />
          </button>
        </>
      ) : null}
    </div>
  );
}
