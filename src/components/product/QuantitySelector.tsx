"use client";

import { Minus, Plus } from "lucide-react";

type QuantitySelectorProps = {
  value: number;
  onIncrement: (event: React.MouseEvent) => void;
  onDecrement: (event: React.MouseEvent) => void;
  incrementLabel: string;
  decrementLabel: string;
  disabled?: boolean;
};

export function QuantitySelector({
  value,
  onIncrement,
  onDecrement,
  incrementLabel,
  decrementLabel,
  disabled = false,
}: QuantitySelectorProps) {
  return (
    <div className="food-qty" role="group" aria-label="Количество">
      <button
        type="button"
        className="food-qty__btn"
        onClick={onDecrement}
        aria-label={decrementLabel}
        disabled={disabled}
      >
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
      <span className="food-qty__value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="food-qty__btn"
        onClick={onIncrement}
        aria-label={incrementLabel}
        disabled={disabled}
      >
        <Plus className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
