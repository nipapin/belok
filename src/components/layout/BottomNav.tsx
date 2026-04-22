"use client";

import { MenuLabel } from "@/types";
import { Home, ShoppingCart, User, UtensilsCrossed } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useLayoutEffect, useRef, useState } from "react";
import NavItem from "../ui/NavItem";

const navItems = [
  { label: MenuLabel.HOME, icon: Home, path: "/" },
  { label: MenuLabel.MENU, icon: UtensilsCrossed, path: "/menu" },
  { label: MenuLabel.CART, icon: ShoppingCart, path: "/cart" },
  { label: MenuLabel.PROFILE, icon: User, path: "/profile" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [lozenge, setLozenge] = useState({ x: 0, y: 0, width: 0, height: 0, visible: false });

  const currentValue = navItems.findIndex((item) => (item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)));

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
  }, [updateLozenge, pathname]);

  useLayoutEffect(() => {
    window.addEventListener("resize", updateLozenge);
    return () => window.removeEventListener("resize", updateLozenge);
  }, [updateLozenge]);

  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-1200 flex justify-center px-2 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
      <nav
        ref={navRef}
        role="navigation"
        aria-label="Основная навигация"
        className="pointer-events-auto relative flex w-full max-w-[400px] items-center justify-between gap-0.5 px-2 py-2 lg-nav"
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
          const Icon = item.icon;
          return (
            <NavItem
              key={item.path}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              label={item.label}
              selected={selected}
              Icon={Icon}
              onClick={() => router.push(item.path)}
            />
          );
        })}
      </nav>
    </div>
  );
}
