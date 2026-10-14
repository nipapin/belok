"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  BarChart3,
  Warehouse,
  ClipboardList,
  LayoutDashboard,
  MoreHorizontal,
  UtensilsCrossed,
  Tags,
  ChefHat,
  Receipt,
  Users,
  UserRoundCog,
  Settings,
  ScanLine,
  Sparkles,
  Home,
  LogOut,
  Flame,
  ExternalLink,
  X,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { canAccessPage, hasPermission, isStaff, staffHome, displayRoles } from '@/lib/roles';
import { brandMark } from "@/lib/brand";
import { fetchAdminOrders } from "@/lib/adminDashboard";
import AdminNewOrderWatcher from "@/components/admin/AdminNewOrderWatcher";
import AdminUpdateButton from "@/components/admin/AdminUpdateButton";
import "@/app/admin/admin-ux.css";

const overviewItem = { label: "Обзор", icon: LayoutDashboard, path: "/admin" };
const menuGroups = [
  {
    id: "operations", label: "Работа заведения", icon: BriefcaseBusiness,
    items: [
      { label: "Управляющий", icon: BriefcaseBusiness, path: "/admin/manager" },
      { label: "Заказы", icon: Receipt, path: "/admin/orders" },
      { label: "Касса и лояльность", icon: ScanLine, path: "/admin/loyalty" },
      { label: "Стоп-лист", icon: UtensilsCrossed, path: "/admin/availability" },
    ],
  },
  {
    id: "catalog", label: "Меню и склад", icon: Warehouse,
    items: [
      { label: "Товары", icon: UtensilsCrossed, path: "/admin/products" },
      { label: "Товары 2.0", icon: ClipboardList, path: "/admin/products-v2" },
      { label: "Категории", icon: Tags, path: "/admin/categories" },
      { label: "Ингредиенты", icon: ChefHat, path: "/admin/ingredients" },
      { label: "Склад", icon: Warehouse, path: "/admin/inventory" },
      { label: "Техкарты", icon: ClipboardList, path: "/admin/recipes" },
      { label: "Хиты", icon: Flame, path: "/admin/hits" },
    ],
  },
  {
    id: "kitchen", label: "Кухня", icon: ChefHat,
    items: [
      { label: "Кухонная доска", icon: ClipboardList, path: "/order-board" },
      { label: "Приготовление", icon: ChefHat, path: "/kitchen" },
      { label: "Техкарты кухни", icon: ChefHat, path: "/admin/kitchen" },
    ],
  },
  {
    id: "analytics", label: "Аналитика", icon: BarChart3,
    items: [
      { label: "Отчётность", icon: BarChart3, path: "/admin/reports" },
      { label: "Выручка", icon: BarChart3, path: "/admin/revenue" },
      { label: "Продажи блюд", icon: UtensilsCrossed, path: "/admin/dish-sales" },
    ],
  },
  {
    id: "team", label: "Команда", icon: Users,
    items: [
      { label: "Сотрудники", icon: UserRoundCog, path: "/admin/employees" },
      { label: "Пользователи", icon: Users, path: "/admin/users" },
      { label: "Журнал доступа", icon: ClipboardList, path: "/admin/audit" },
    ],
  },
  {
    id: "system", label: "Система и сайт", icon: Settings,
    items: [
      { label: "Настройки", icon: Settings, path: "/admin/settings" },
      { label: "Уведомления", icon: Bell, path: "/admin/notifications" },
      { label: "Главная сайта", icon: Home, path: "/admin/home" },
      { label: "Приветствие", icon: Sparkles, path: "/admin/walkthrough" },
    ],
  },
];
const mobileItems = [
  overviewItem,
  { label: "Заказы", icon: Receipt, path: "/admin/orders" },
  { label: "Управляющий", icon: BriefcaseBusiness, path: "/admin/manager" },
  { label: "Склад", icon: Warehouse, path: "/admin/inventory" },
];
const navigationStorageKey = "belok.admin.navigation.groups.v1";
function readExpandedGroups(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(navigationStorageKey) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, expanded]) =>
      menuGroups.some(group => group.id === key) && typeof expanded === "boolean"));
  } catch { return {}; }
}

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
    enabled: !isLoading && hasPermission(user, 'orders'),
  });
  const pendingCount = (ordersData?.orders ?? []).filter(
    (o) => o.status === "PENDING",
  ).length;
  const selected = (path: string) =>
    path === "/admin"
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`);
  const currentPage = [overviewItem, ...menuGroups.flatMap((group) => group.items)]
    .find((item) => selected(item.path));
  const activeGroup = menuGroups.find(group => group.items.some(item => selected(item.path)))?.id;
  const [groupState, setGroupState] = useState(() => ({
    pathname,
    expanded: { ...readExpandedGroups(), ...(activeGroup ? { [activeGroup]: true } : {}) },
  }));
  if (groupState.pathname !== pathname) {
    setGroupState({ pathname, expanded: {
      ...groupState.expanded, ...(activeGroup ? { [activeGroup]: true } : {}),
    } });
  }
  const toggleGroup = (id: string) => {
    const expanded = { ...groupState.expanded, [id]: !groupState.expanded[id] };
    setGroupState({ pathname, expanded });
    try { localStorage.setItem(navigationStorageKey, JSON.stringify(expanded)); } catch { /* Storage may be unavailable. */ }
  };
  // Product editing already has a fixed save bar: give it the entire bottom edge.
  const editingProduct =
    pathname === "/admin/products/new" ||
    pathname === "/admin/products-v2/new" ||
    /^\/admin\/products-v2\/[^/]+\/details$/.test(pathname) ||
    /^\/admin\/products\/[^/]+\/edit$/.test(pathname);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);
  const isUnauthorized = !isLoading && (!user || !isStaff(user) || !canAccessPage(user, pathname));
  useEffect(() => {
    if (isUnauthorized) router.replace(user && isStaff(user) ? staffHome(user) : "/");
  }, [isUnauthorized, router, user]);
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

  const navigation = (surface: "desktop" | "mobile") => (
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
      <nav className={`admin-grouped-nav ${surface === "mobile" ? "admin-tile-nav" : ""}`} aria-label="Разделы админки">
        {canAccessPage(user, overviewItem.path) && (
          <Link href={overviewItem.path} prefetch={false}
            aria-current={selected(overviewItem.path) ? "page" : undefined}
            onClick={() => setMobileOpen(false)}
            className={`admin-nav-item admin-nav-overview ${selected(overviewItem.path) ? "is-selected" : ""}`}>
            <LayoutDashboard size={19} strokeWidth={1.8} aria-hidden="true" />
            <span>{overviewItem.label}</span>
          </Link>
        )}
        {menuGroups.map(group => ({...group, items: group.items.filter(item => canAccessPage(user, item.path))})).filter(group => group.items.length).map((group) => (
          <div key={group.id} className="admin-nav-group">
            {surface === "mobile" ? <h3 className="admin-tile-group-heading">{group.label}</h3> : <button type="button"
              className={`admin-nav-group-toggle ${group.id === activeGroup ? "has-selected" : ""}`}
              aria-expanded={!!groupState.expanded[group.id]}
              aria-controls={`admin-nav-${surface}-${group.id}`}
              onClick={() => toggleGroup(group.id)}>
              <group.icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{group.label}</span>
              {group.id === "operations" && pendingCount > 0 && (
                <span className="admin-count" aria-label={`${pendingCount} ожидают подтверждения`}>{pendingCount > 99 ? "99+" : pendingCount}</span>
              )}
              <ChevronDown size={16} className="admin-nav-chevron" aria-hidden="true" />
            </button>}
            <div id={`admin-nav-${surface}-${group.id}`} className="admin-nav-group-items" hidden={surface === "desktop" && !groupState.expanded[group.id]}>
            {group.items.map(({ icon: Icon, ...item }) => (
              <Link
                key={item.path}
                href={item.path}
                prefetch={false}
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
          </div>
        ))}
      </nav>
      <div className="admin-account">
        <span className="admin-avatar" aria-hidden="true">
          {(user?.name || user?.email || "А").slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{user?.name || (user ? displayRoles(user) : "Сотрудник")}</strong>
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
      <aside className="admin-desktop-sidebar">{navigation("desktop")}</aside>
      <header className="admin-header-bar admin-workspace-header">
        <Link
          href={user ? staffHome(user) : "/admin"}
          className="admin-mobile-brand"
          aria-label="Belok — обзор"
        >
          {brandMark}
        </Link>
        <span className="admin-header-location">
          Рабочее пространство <ChevronRight size={14} aria-hidden="true" />{" "}
          <strong>{currentPage?.label || "Обзор"}</strong>
        </span>
        <AdminUpdateButton />
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
          {hasPermission(user, 'orders') && <Link
            href="/admin/orders"
            className={`admin-icon-button admin-header-orders ${editingProduct ? "admin-editor-orders" : ""}`}
            aria-label={`Заказы, ожидают подтверждения: ${pendingCount}`}
          >
            <Bell size={19} />
            {pendingCount > 0 && <span className="admin-notification-dot" />}
          </Link>}
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
        {hasPermission(user, 'orders') && <AdminNewOrderWatcher />}
        {children}
      </main>
      {!editingProduct && (
        <nav
          className="admin-bottom-nav"
          aria-label="Основная навигация админки"
          style={{ gridTemplateColumns: `repeat(${mobileItems.filter(item => canAccessPage(user, item.path)).length + 1}, minmax(0, 1fr))` }}
          inert={mobileOpen || undefined}
        >
          {mobileItems.filter(item => canAccessPage(user, item.path)).map(({ icon: Icon, ...item }) => (
            <Link
              key={item.path}
              href={item.path}
              prefetch={false}
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
          {navigation("mobile")}
        </div>
      </dialog>
    </div>
  );
}
