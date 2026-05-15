"use client";

import { MenuLabel } from "@/types";
import { Home, LayoutDashboard, QrCode, ScanLine, ShoppingCart, User, UtensilsCrossed } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import NavItem from "../ui/NavItem";
import UserQrModal from "../loyalty/UserQrModal";
import { useAuthStore } from "@/store/authStore";
import { useHaptic } from "@/hooks/useHaptic";

type NavItemConfig = {
  id: string;
  label: MenuLabel;
  icon: React.ElementType;
  /** Внешний путь — клик переводит на него (и определяет активность). */
  path?: string;
  /** Локальное действие (например, открыть модалку с QR). */
  action?: "qr";
  /** Аватар вместо иконки (только для профиля). */
  avatarUrl?: string | null;
};

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const haptic = useHaptic();
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [lozenge, setLozenge] = useState({ x: 0, y: 0, width: 0, height: 0, visible: false });
  const [qrOpen, setQrOpen] = useState(false);

  const profilePathAlias = pathname.startsWith("/auth") ? "/profile" : pathname;

  const navItems = useMemo<NavItemConfig[]>(() => {
    const base: NavItemConfig[] = [
      { id: "home", label: MenuLabel.HOME, icon: Home, path: "/" },
      { id: "menu", label: MenuLabel.MENU, icon: UtensilsCrossed, path: "/menu" },
      { id: "cart", label: MenuLabel.CART, icon: ShoppingCart, path: "/cart" },
    ];

    if (!user) {
      return [
        ...base,
        { id: "profile", label: MenuLabel.PROFILE, icon: User, path: "/profile" },
      ];
    }

    if (user.role === "ADMIN") {
      return [
        ...base,
        { id: "scan", label: MenuLabel.SCAN, icon: ScanLine, path: "/admin/loyalty" },
        { id: "admin", label: MenuLabel.ADMIN, icon: LayoutDashboard, path: "/admin" },
      ];
    }

    return [
      ...base,
      { id: "qr", label: MenuLabel.QR, icon: QrCode, action: "qr" },
      {
        id: "profile",
        label: MenuLabel.PROFILE,
        icon: User,
        path: "/profile",
        avatarUrl: user.avatarUrl,
      },
    ];
  }, [user]);

  const currentValue = useMemo(() => {
    if (qrOpen) {
      const idx = navItems.findIndex((i) => i.action === "qr");
      if (idx >= 0) return idx;
    }
    return navItems.findIndex((item) => {
      if (!item.path) return false;
      return item.path === "/"
        ? profilePathAlias === "/"
        : profilePathAlias.startsWith(item.path);
    });
  }, [navItems, profilePathAlias, qrOpen]);

  const updateLozenge = useCallback(() => {
    const nav = navRef.current;
    const btn = itemRefs.current[currentValue];
    if (!nav || !btn || currentValue < 0) {
      setLozenge((s) => ({ ...s, visible: false }));
      return;
    }
    const nr = nav.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setLozenge({
      x: br.left - nr.left,
      y: br.top - nr.top,
      width: br.width,
      height: br.height,
      visible: true,
    });
  }, [currentValue]);

  useLayoutEffect(() => {
    startTransition(() => {
      updateLozenge();
    });
  }, [updateLozenge, pathname, navItems.length]);

  useLayoutEffect(() => {
    window.addEventListener("resize", updateLozenge);
    return () => window.removeEventListener("resize", updateLozenge);
  }, [updateLozenge]);

  if (pathname.startsWith("/admin")) return null;

  const handleClick = (item: NavItemConfig) => {
    if (item.action === "qr") {
      haptic("medium");
      setQrOpen(true);
      return;
    }
    if (item.path) {
      haptic("selection");
      router.push(item.path);
    }
  };

  return (
    <>
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-1200 flex justify-center px-2 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
        <nav
          ref={navRef}
          role="navigation"
          aria-label="Основная навигация"
          className="pointer-events-auto relative flex w-full max-w-[420px] items-center justify-between gap-0.5 px-2 py-2 lg-nav"
        >
          {lozenge.visible && (
            <div
              className="lg-nav-lozenge lg-pill lg-active"
              style={{
                left: lozenge.x,
                top: lozenge.y,
                width: lozenge.width,
                height: lozenge.height,
              }}
              aria-hidden
            />
          )}
          {navItems.map((item, index) => {
            const selected = currentValue === index;
            return (
              <NavItem
                key={item.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                label={item.label}
                selected={selected}
                Icon={item.icon}
                avatarUrl={item.avatarUrl}
                onClick={() => handleClick(item)}
              />
            );
          })}
        </nav>
      </div>

      {user && user.role !== "ADMIN" && (
        <UserQrModal
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          userId={user.id}
          userName={user.name}
        />
      )}
    </>
  );
}
