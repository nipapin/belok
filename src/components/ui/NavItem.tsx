"use client";

import { useCartStore } from "@/store/cartStore";
import { useHydrated } from "@/hooks/useHydrated";
import { MenuLabel } from "@/types";
import { forwardRef } from "react";

interface NavItemProps {
  label: MenuLabel;
  selected: boolean;
  Icon: React.ElementType;
  onClick: () => void;
}

const NavItem = forwardRef<HTMLButtonElement, NavItemProps>(function NavItem(
  { label, selected, Icon, onClick },
  ref,
) {
  const totalItems = useCartStore((s) => s.getTotalItems());
  const hydrated = useHydrated();
  const isCart = label === MenuLabel.CART;
  const showBadge = hydrated && isCart && totalItems > 0;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`relative z-10 outline-none focus:outline-none flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full py-2.5 text-[0.65rem] font-semibold leading-none transition ${
        selected ? "text-[var(--lg-text)]" : "text-[var(--lg-text-muted)]"
      }`}
    >
      <Icon className="size-[22px]" strokeWidth={selected ? 2 : 1.65} />
      <span className="max-w-full truncate px-0.5">{label}</span>
      {showBadge && (
        <span className="absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border border-white/25 bg-rose-500/95 px-1 text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(225,29,72,0.45)] backdrop-blur-sm">
          {totalItems}
        </span>
      )}
    </button>
  );
});

export default NavItem;
