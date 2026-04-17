'use client';

import { Home, UtensilsCrossed, ShoppingCart, User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  { label: 'Главная', icon: Home, path: '/' },
  { label: 'Меню', icon: UtensilsCrossed, path: '/menu' },
  { label: 'Корзина', icon: ShoppingCart, path: '/cart' },
  { label: 'Профиль', icon: User, path: '/profile' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname.startsWith('/admin')) return null;

  const currentValue = navItems.findIndex((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
  );

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-[1200] flex justify-center px-4 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
      <nav
        role="navigation"
        aria-label="Основная навигация"
        className="pointer-events-auto flex w-full max-w-[400px] items-center justify-between gap-0.5 rounded-full border border-white/25 bg-zinc-900/55 px-2 py-2 shadow-[0_12px_48px_rgba(0,0,0,0.22)] backdrop-blur-2xl backdrop-saturate-150"
      >
        {navItems.map((item, index) => {
          const selected = currentValue === index;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => router.push(item.path)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full py-2.5 text-[0.65rem] font-semibold leading-none transition ${
                selected
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-white/55 hover:text-white/90'
              }`}
            >
              <Icon className="size-[22px]" strokeWidth={selected ? 2 : 1.65} />
              <span className="max-w-full truncate px-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
