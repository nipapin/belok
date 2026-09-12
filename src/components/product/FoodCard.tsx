"use client";

import { useCallback, useRef } from "react";
import Image from "next/image";
import { Heart } from "lucide-react";
import { NutritionChip } from "./NutritionChip";
import { PriceCTA } from "./PriceCTA";
import "./food-card.css";

export type FoodCardNutrition = {
  calories?: number | null;
  proteins?: number | null;
  weightGrams?: number | null;
};

export type FoodCardModel = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  categoryName?: string | null;
} & FoodCardNutrition;

type FoodCardProps = {
  product: FoodCardModel;
  quantity: number;
  busy?: boolean;
  favorite?: boolean;
  eager?: boolean;
  onOpen: () => void;
  onAdd: (event: React.MouseEvent) => void;
  onIncrement: (event: React.MouseEvent) => void;
  onDecrement: (event: React.MouseEvent) => void;
  onToggleFavorite?: (event: React.MouseEvent) => void;
};

function nutritionChips(product: FoodCardNutrition): string[] {
  const chips: string[] = [];
  if (product.calories != null) chips.push(`${product.calories} ккал`);
  if (product.weightGrams != null) chips.push(`${product.weightGrams} г`);
  if (product.proteins != null) chips.push(`Б ${product.proteins} г`);
  return chips;
}

function prefersFineHover() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FoodCard({
  product,
  quantity,
  busy = false,
  favorite = false,
  eager = false,
  onOpen,
  onAdd,
  onIncrement,
  onDecrement,
  onToggleFavorite,
}: FoodCardProps) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const chips = nutritionChips(product);
  const openLabel = `Открыть ${product.name}, ${product.price} руб.`;

  const resetParallax = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.style.setProperty("--food-px", "0px");
    el.style.setProperty("--food-py", "-6px");
  }, []);

  const handleParallax = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!prefersFineHover() || prefersReducedMotion()) return;
    const el = mediaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--food-px", `${(x * 12).toFixed(1)}px`);
    el.style.setProperty("--food-py", `${(y * 10 - 4).toFixed(1)}px`);
  }, []);

  return (
    <article
      className="food-card"
      onMouseMove={handleParallax}
      onMouseLeave={resetParallax}
    >
      <div className="food-card__clip">
        <button
          type="button"
          className="food-card__main"
          onClick={onOpen}
          aria-label={openLabel}
        >
          <div ref={mediaRef} className="food-card__media">
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 46vw, 200px"
                className="food-card__img object-cover"
                loading={eager ? "eager" : "lazy"}
                fetchPriority={eager ? "high" : "auto"}
              />
            ) : (
              <span className="food-card__fallback" aria-hidden>
                {product.name[0]}
              </span>
            )}
            {product.categoryName ? (
              <span className="food-card__badge">{product.categoryName}</span>
            ) : null}
          </div>

          <div className="food-card__body">
            <h3 className="food-card__title">{product.name}</h3>
            {chips.length > 0 ? (
              <div className="food-card__chips">
                {chips.map((label) => (
                  <NutritionChip key={label} label={label} />
                ))}
              </div>
            ) : null}
          </div>
        </button>

        {onToggleFavorite ? (
          <button
            type="button"
            className="food-card__fav"
            aria-label={
              favorite
                ? `Убрать ${product.name} из избранного`
                : `Добавить ${product.name} в избранное`
            }
            aria-pressed={favorite}
            onClick={onToggleFavorite}
          >
            <span className="food-card__fav-glyph">
              <Heart
                className="size-4"
                strokeWidth={2.25}
                fill={favorite ? "currentColor" : "none"}
              />
            </span>
          </button>
        ) : null}

        <div
          className="food-card__footer"
          onClick={(event) => event.stopPropagation()}
        >
          <PriceCTA
            price={product.price}
            quantity={quantity}
            busy={busy}
            addLabel={`Добавить ${product.name} в корзину`}
            incrementLabel={`Добавить ещё ${product.name}`}
            decrementLabel={`Убрать ${product.name} из корзины`}
            onAdd={onAdd}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
          />
        </div>
      </div>
    </article>
  );
}

export function FoodCardSkeleton() {
  return <div className="food-card-skeleton animate-pulse" aria-hidden />;
}
