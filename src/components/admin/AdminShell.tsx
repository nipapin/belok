"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  MoreHorizontal,
  UtensilsCrossed,
  Tags,
  ChefHat,
  Receipt,
  Users,
  Settings,
  ScanLine,
  Sparkles,
  Home,
  LogOut,
  Flame,
  ExternalLink,
  X,
  ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { brandMark } from "@/lib/brand";
import { fetchAdminOrders } from "@/lib/adminDashboard";
import AdminNewOrderWatcher from "@/components/admin/AdminNewOrderWatcher";
import "@/app/admin/admin-ux.css";

const menuGroups = [
  {
    label: "Рабочее пространство",
    items: [
      { label: "Обзор", icon: LayoutDashboard, path: "/admin" },
      { label: "Заказы", icon: Receipt, path: "/admin/orders" },
      { label: "Касса и лояльность", icon: ScanLine, path: "/admin/loyalty" },
    ],
  },
  {
    label: "Меню кафе",
    items: [
      { label: "Товары", icon: UtensilsCrossed, path: "/admin/products" },
      { label: "Категории", icon: Tags, path: "/admin/categories" },
      { label: "Ингредиенты", icon: ChefHat, path: "/admin/ingredients" },
      { label: "Хиты", icon: Flame, path: "/admin/hits" },
    ],
  },
  {
    label: "Управление",
    items: [
      { label: "Пользователи", icon: Users, path: "/admin/users" },
      { label: "Уведомления", icon: Bell, path: "/admin/notifications" },
      { label: "Главная сайта", icon: Home, path: "/admin/home" },
      { label: "Приветствие", icon: Sparkles, path: "/admin/walkthrough" },
      { label: "Настройки", icon: Settings, path: "/admin/settings" },
    ],
  },
];
const mobileItems = [
  { label: "Обзор", icon: LayoutDashboard, path: "/admin" },
  { label: "Заказы", icon: Receipt, path: "/admin/orders" },
  { label: "Касса", icon: ScanLine, path: "/admin/loyalty" },
  { label: "Товары", icon: UtensilsCrossed, path: "/admin/products" },
];

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, fetchUser, isLoading, logout } = useAuthStore();
  const { data: ordersData } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: fetchAdminOrders,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    enabled: !isLoading && user?.role === "ADMIN",
  });
  const pendingCount = (ordersData?.orders ?? []).filter(
    (o) => o.status === "PENDING",
  ).length;
  const selected = (path: string) =>
    path === "/admin"
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`);
  const currentPage = menuGroups
    .flatMap((group) => group.items)
    .find((item) => selected(item.path));
  // Product editing already has a fixed save bar: give it the entire bottom edge.
  const editingProduct =
    pathname === "/admin/products/new" ||
    /^\/admin\/products\/[^/]+\/edit$/.test(pathname);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);
  const isUnauthorized = !isLoading && (!user || user.role !== "ADMIN");
  useEffect(() => {
    if (isUnauthorized) router.replace("/");
  }, [isUnauthorized, router]);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (mobileOpen && dialog && !dialog.open) dialog.showModal();
    if (!mobileOpen && dialog?.open) dialog.close();
  }, [mobileOpen]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (media.matches) setMobileOpen(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  if (isLoading || isUnauthorized)
    return (
      <div className="admin-auth-loading" role="status">
        Открываем панель управления…
      </div>
    );

  const navigation = (
    <>
      <div className="admin-brand">
        <span className="admin-brand-icon" aria-hidden="true">
          б
        </span>
        <div>
          <span className="admin-brand-name">{brandMark}</span>
          <span className="admin-brand-caption">Панель управления</span>
        </div>
      </div>
      <nav className="admin-grouped-nav" aria-label="Разделы админки">
        {menuGroups.map((group) => (
          <div key={group.label} className="admin-nav-group">
            <p className="admin-nav-label">{group.label}</p>
            {group.items.map(({ icon: Icon, ...item }) => (
              <Link
                key={item.path}
                href={item.path}
                aria-current={selected(item.path) ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={`admin-nav-item ${selected(item.path) ? "is-selected" : ""}`}
              >
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
                {item.path === "/admin/orders" && pendingCount > 0 && (
                  <span
                    className="admin-count"
                    aria-label={`${pendingCount} ожидают подтверждения`}
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="admin-account">
        <span className="admin-avatar" aria-hidden="true">
          {(user?.name || user?.email || "А").slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{user?.name || "Администратор"}</strong>
          <span>{user?.email || user?.phone}</span>
        </div>
        <button
          type="button"
          className="admin-icon-button"
          aria-label="Выйти из аккаунта"
          onClick={async () => {
            await logout();
            router.replace("/");
          }}
        >
          <LogOut size={18} />
        </button>
      </div>
    </>
  );

  return (
    <div
      className={`admin-surface admin-workspace ${editingProduct ? "admin-workspace-editing" : ""}`}
    >
      <a className="admin-skip-link" href="#admin-main">
        К содержимому
      </a>
      <aside className="admin-desktop-sidebar">{navigation}</aside>
      <header className="admin-header-bar admin-workspace-header">
        <Link
          href="/admin"
          className="admin-mobile-brand"
          aria-label="Belok — обзор"
        >
          {brandMark}
        </Link>
        <span className="admin-header-location">
          Рабочее пространство <ChevronRight size={14} aria-hidden="true" />{" "}
          <strong>{currentPage?.label || "Обзор"}</strong>
        </span>
        <span className="admin-environment">
          {process.env.NODE_ENV === "development" ||
          process.env.NEXT_PUBLIC_APP_URL?.includes("dev.")
            ? "DEV"
            : "ADMIN"}
        </span>
        <div className="admin-header-actions">
          {editingProduct && (
            <button
              className="admin-editor-menu admin-icon-button"
              type="button"
              aria-label="Все разделы"
              aria-haspopup="dialog"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <MoreHorizontal size={22} />
            </button>
          )}
          <Link
            href="/admin/orders"
            className={`admin-icon-button admin-header-orders ${editingProduct ? "admin-editor-orders" : ""}`}
            aria-label={`Заказы, ожидают подтверждения: ${pendingCount}`}
          >
            <Bell size={19} />
            {pendingCount > 0 && <span className="admin-notification-dot" />}
          </Link>
          <Link href="/" className="admin-site-link">
            <ExternalLink size={16} aria-hidden="true" />
            <span>На сайт</span>
          </Link>
        </div>
      </header>
      <main
        id="admin-main"
        ref={mainRef}
        tabIndex={-1}
        className="admin-workspace-main"
        inert={mobileOpen || undefined}
      >
        <AdminNewOrderWatcher />
        {children}
      </main>
      {!editingProduct && (
        <nav
          className="admin-bottom-nav"
          aria-label="Основная навигация админки"
          inert={mobileOpen || undefined}
        >
          {mobileItems.map(({ icon: Icon, ...item }) => (
            <Link
              key={item.path}
              href={item.path}
              className={`admin-bottom-item ${selected(item.path) ? "is-selected" : ""}`}
              aria-current={selected(item.path) ? "page" : undefined}
            >
              <span className="admin-bottom-icon">
                <Icon
                  size={21}
                  strokeWidth={selected(item.path) ? 2.2 : 1.8}
                  aria-hidden="true"
                />
                {item.path === "/admin/orders" && pendingCount > 0 && (
                  <span className="admin-bottom-badge">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
          <button
            type="button"
            className={`admin-bottom-item ${!mobileItems.some((item) => selected(item.path)) ? "is-selected" : ""}`}
            onClick={() => setMobileOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
          >
            <MoreHorizontal size={22} aria-hidden="true" />
            <span>Ещё</span>
          </button>
        </nav>
      )}
      <dialog
        ref={dialogRef}
        className="admin-navigation-dialog"
        aria-labelledby="admin-navigation-title"
        onClose={() => setMobileOpen(false)}
        onCancel={() => setMobileOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setMobileOpen(false);
        }}
      >
        <div className="admin-dialog-content">
          <div className="admin-dialog-heading">
            <h2 id="admin-navigation-title">Все разделы</h2>
            <button
              type="button"
              className="admin-icon-button"
              aria-label="Закрыть меню"
              onClick={() => setMobileOpen(false)}
            >
              <X size={22} />
            </button>
          </div>
          {navigation}
        </div>
      </dialog>
    </div>
  );
}
