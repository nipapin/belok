"use client";

import { MenuLabel } from "@/types";
import { Home, ShoppingCart, User, UtensilsCrossed } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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

  if (pathname.startsWith("/admin")) return null;

  const currentValue = navItems.findIndex((item) => (item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)));

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-1200 flex justify-center px-4 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
      <nav
        role="navigation"
        aria-label="Основная навигация"
        className="pointer-events-auto flex w-full max-w-[400px] items-center justify-between gap-0.5 rounded-full glass-effect px-2 py-2 glass-border"
      >
        {navItems.map((item, index) => {
          const selected = currentValue === index;
          const Icon = item.icon;
          return <NavItem key={item.path} label={item.label} selected={selected} Icon={Icon} onClick={() => router.push(item.path)} />;
        })}
      </nav>
    </div>
  );
}
