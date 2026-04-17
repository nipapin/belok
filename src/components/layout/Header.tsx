'use client';

import { ShoppingCart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { brandMark } from '@/lib/brand';

export default function Header() {
  const router = useRouter();
  const totalItems = useCartStore((s) => s.getTotalItems());

  return (
    <header className="sticky top-0 z-[1100] pt-1">
      <div className="flex items-center justify-between py-2">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="rounded-2xl px-1 text-left transition hover:bg-white/30"
        >
          <span className="heading-display lowercase tracking-[-0.04em] text-zinc-900">
            {brandMark}
          </span>
        </button>
        <button
          type="button"
          onClick={() => router.push('/cart')}
          className="btn-icon relative border-zinc-900/8 bg-white/60"
          aria-label="Корзина"
        >
          <ShoppingCart className="size-[22px]" strokeWidth={1.75} />
          {totalItems > 0 && (
            <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white shadow-sm">
              {totalItems > 99 ? '99+' : totalItems}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
