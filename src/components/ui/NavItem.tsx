"use client";

import { useCartStore } from "@/store/cartStore";
import { useHydrated } from "@/hooks/useHydrated";
import { MenuLabel } from "@/types";

interface NavItemProps {
  label: MenuLabel;
  selected: boolean;
  Icon: React.ElementType;
  onClick: () => void;
}

export default function NavItem({ label, selected, Icon, onClick }: NavItemProps) {
  const totalItems = useCartStore((s) => s.getTotalItems());
  const hydrated = useHydrated();
  const isCart = label === MenuLabel.CART;
  const showBadge = hydrated && isCart && totalItems > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative outline-none focus:outline-none flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full py-2.5 text-[0.65rem] font-semibold leading-none transition ${
        selected ? "glass-border text-white shadow-sm" : "text-white/80"
      }`}
    >
      <Icon className="size-[22px]" strokeWidth={selected ? 2 : 1.65} />
      <span className="max-w-full truncate px-0.5">{label}</span>
      {showBadge && (
        <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white shadow-sm">
          {totalItems}
        </span>
      )}
    </button>
  );
}
