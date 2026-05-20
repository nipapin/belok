'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  LayoutDashboard,
  Menu,
  UtensilsCrossed,
  Tags,
  ChefHat,
  Receipt,
  Users,
  Settings,
  ScanLine,
  LogOut,
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
  { label: 'Касса · Лояльность', icon: ScanLine, path: '/admin/loyalty' },
  { label: 'Пользователи', icon: Users, path: '/admin/users' },
  { label: 'Уведомления', icon: Bell, path: '/admin/notifications' },
  { label: 'Настройки', icon: Settings, path: '/admin/settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mdUp = useMdUp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, fetchUser, isLoading, logout } = useAuthStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const isUnauthorized = !isLoading && (!user || user.role !== 'ADMIN');

  useEffect(() => {
    if (isUnauthorized) router.replace('/');
  }, [isUnauthorized, router]);

  if (isLoading || isUnauthorized) return null;

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  const drawer = (
    <div className="admin-drawer-panel flex h-full flex-col">
      <div className="flex items-center justify-start p-3">
        <p className="m-0 text-2xl font-extrabold leading-none tracking-tight text-(--lg-text)">
          <span className="lowercase">{brandMark}</span>
        </p>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-2">
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
      <div className="border-t border-(--lg-ring) p-3">
        {(user?.email || user?.phone) && (
          <p className="mb-2 truncate px-1 text-xs text-(--lg-text-muted)">
            {user.email ?? user.phone}
          </p>
        )}
        <button type="button" className="profile-logout w-full py-2.5" onClick={handleLogout}>
          <LogOut className="size-4 shrink-0" strokeWidth={2} />
          Выйти
        </button>
      </div>
    </div>
  );

  return (
    <div className="admin-surface h-dvh min-h-0 w-full overflow-hidden pb-[env(safe-area-inset-bottom)]">
      <header className="admin-header-bar fixed left-0 right-0 top-0 z-[1300] flex h-(--admin-nav-h) items-center px-3 pt-(--admin-nav-pad-top) md:left-[260px]">
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
            className="fixed inset-0 z-[1350] bg-black/35 backdrop-blur-sm"
            aria-label="Закрыть меню"
            onClick={() => setMobileOpen(false)}
          />
          {/* Выше header (z-1300), иначе шапка перекрывала верх дровера */}
          <aside className="fixed left-0 top-0 z-[1360] h-full w-[260px] shadow-2xl">
            {drawer}
          </aside>
        </>
      )}

      {mdUp && (
        <aside className="fixed bottom-0 left-0 top-0 z-[1240] w-[260px] shadow-[4px_0_24px_rgba(0,0,0,0.04)]">
          {drawer}
        </aside>
      )}

      <main className="box-border h-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide px-2 pb-8 pt-(--admin-main-pad-top) md:pl-[calc(260px+1rem)] md:pr-8">
        {children}
      </main>
    </div>
  );
}
