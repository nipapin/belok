'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ArrowLeft,
  LayoutDashboard,
  Menu,
  UtensilsCrossed,
  Tags,
  ChefHat,
  Receipt,
  Users,
  Settings,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useMdUp } from '@/hooks/useMdUp';
import { brandMark } from '@/lib/brand';

const menuItems = [
  { label: 'Дашборд', icon: LayoutDashboard, path: '/admin' },
  { label: 'Товары', icon: UtensilsCrossed, path: '/admin/products' },
  { label: 'Категории', icon: Tags, path: '/admin/categories' },
  { label: 'Ингредиенты', icon: ChefHat, path: '/admin/ingredients' },
  { label: 'Заказы', icon: Receipt, path: '/admin/orders' },
  { label: 'Пользователи', icon: Users, path: '/admin/users' },
  { label: 'Настройки', icon: Settings, path: '/admin/settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mdUp = useMdUp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, fetchUser, isLoading } = useAuthStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (isLoading) return null;

  if (!user || user.role !== 'ADMIN') {
    router.push('/');
    return null;
  }

  const drawer = (
    <div className="admin-drawer-panel flex h-full flex-col py-4">
      <div className="flex h-14 items-center justify-center px-2">
        <p className="text-center text-sm font-extrabold tracking-tight text-(--lg-text)">
          <span className="lowercase">{brandMark}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-(--lg-text-muted)">
            админ
          </span>
        </p>
      </div>
      <nav className="mt-2 flex-1 space-y-0.5 px-2">
        {menuItems.map((item) => {
          const selected = pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => {
                router.push(item.path);
                if (!mdUp) setMobileOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                selected
                  ? 'border-(--lg-ring-strong) bg-[#18181b] text-white shadow-(--lg-shadow)'
                  : 'border-(--lg-ring) text-(--lg-text) hover:border-(--lg-ring-strong) hover:bg-(--lg-fill-hover)'
              }`}
            >
              <Icon className="size-5 shrink-0" strokeWidth={selected ? 2 : 1.75} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="admin-surface h-dvh min-h-0 w-full overflow-hidden">
      <header className="admin-header-bar fixed left-0 right-0 top-0 z-[1300] flex h-14 items-center px-3 md:left-[260px]">
        {!mdUp && (
          <button
            type="button"
            className="btn-icon mr-2 size-9 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Меню"
          >
            <Menu className="size-5" />
          </button>
        )}
        <button
          type="button"
          className="btn-icon mr-2 size-9"
          onClick={() => router.push('/')}
          aria-label="На сайт"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="truncate text-base font-semibold text-(--lg-text)">Панель управления</h1>
      </header>

      {!mdUp && mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[1250] bg-black/35 backdrop-blur-sm"
            aria-label="Закрыть меню"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 z-[1260] h-full w-[260px] shadow-2xl">
            {drawer}
          </aside>
        </>
      )}

      {mdUp && (
        <aside className="fixed bottom-0 left-0 top-0 z-[1240] w-[260px] shadow-[4px_0_24px_rgba(0,0,0,0.04)]">
          {drawer}
        </aside>
      )}

      <main className="box-border h-full min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-8 pt-[4.5rem] md:pl-[calc(260px+1rem)] md:pr-8">
        {children}
      </main>
    </div>
  );
}
