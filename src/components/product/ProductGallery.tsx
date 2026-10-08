'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
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
  const userScroll = useRef(false);
  const animateNext = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const choosable = slides.length > 1;
  const safeIndex = slides.length === 0 ? 0 : Math.min(index, slides.length - 1);

  // Apply the requested variant before paint; a smooth initial scroll can
  // otherwise briefly report the first slide and overwrite a deep link.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !choosable) return;
    el.scrollTo({ left: safeIndex * el.clientWidth, behavior: animateNext.current ? 'smooth' : 'instant' });
    animateNext.current = false;
  }, [choosable, safeIndex]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  function onScroll() {
    if (!userScroll.current) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const el = scrollerRef.current;
      if (!el || el.clientWidth === 0) return;
      const next = Math.min(slides.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
      userScroll.current = false;
      if (next !== safeIndex) onIndex(next);
    }, 150);
  }

  function step(delta: number) {
    userScroll.current = false;
    window.clearTimeout(settleTimer.current);
    animateNext.current = true;
    onIndex((safeIndex + delta + slides.length) % slides.length);
  }

  return (
    <div className="relative aspect-square w-full bg-white">
      <div
        ref={scrollerRef}
        onScroll={choosable ? onScroll : undefined}
        onPointerDown={() => { userScroll.current = true; }}
        onWheel={() => { userScroll.current = true; }}
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
            aria-label="Предыдущий вариант"
            onClick={() => step(-1)}
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="btn-icon glass-fx absolute top-1/2 right-4 z-10 -translate-y-1/2"
            aria-label="Следующий вариант"
            onClick={() => step(1)}
          >
            <ChevronRight className="size-5" strokeWidth={1.75} />
          </button>
        </>
      ) : null}
    </div>
  );
}
