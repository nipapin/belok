"use client";

import { Plus } from "lucide-react";
import { QuantitySelector } from "./QuantitySelector";
import { cn } from "@/lib/tailwind";

type PriceCTAProps = {
  price: number;
  quantity: number;
  busy?: boolean;
  addLabel: string;
  incrementLabel: string;
  decrementLabel: string;
  onAdd: (event: React.MouseEvent) => void;
  onIncrement: (event: React.MouseEvent) => void;
  onDecrement: (event: React.MouseEvent) => void;
};

export function PriceCTA({
  price,
  quantity,
  busy = false,
  addLabel,
  incrementLabel,
  decrementLabel,
  onAdd,
  onIncrement,
  onDecrement,
}: PriceCTAProps) {
  const expanded = quantity > 0;

  return (
    <div className="food-price-cta">
      <p className="food-price">{price} ₽</p>
      <div
        className={cn("food-cta-slot", expanded && "food-cta-slot--wide")}
        data-state={busy && !expanded ? "loading" : expanded ? "qty" : "add"}
      >
        {quantity > 0 ? (
          <QuantitySelector
            value={quantity}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            incrementLabel={incrementLabel}
            decrementLabel={decrementLabel}
            disabled={busy}
          />
        ) : busy ? (
          <div className="food-cta-busy" aria-busy="true" aria-live="polite">
            <span className="food-cta-spinner" />
            <span className="sr-only">Добавление…</span>
          </div>
        ) : (
          <button
            type="button"
            className="food-cta-add"
            onClick={onAdd}
            aria-label={addLabel}
          >
            <Plus className="size-5" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
