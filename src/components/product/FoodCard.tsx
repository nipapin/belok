"use client";

import { useCallback, useRef, useState } from "react";
import { NutritionChip } from "./NutritionChip";
import { PriceCTA } from "./PriceCTA";
import { isNewProduct } from "@/lib/productFlags";
import "./food-card.css";

export type FoodCardNutrition = {
  calories?: number | null;
  proteins?: number | null;
  fats?: number | null;
  carbs?: number | null;
  weightGrams?: number | null;
};

export type FoodCardModel = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  categoryName?: string | null;
  createdAt?: string | null;
} & FoodCardNutrition;

type FoodCardProps = {
  product: FoodCardModel;
  quantity: number;
  busy?: boolean;
  eager?: boolean;
  onOpen: () => void;
  onAdd: (event: React.MouseEvent) => void;
  onIncrement: (event: React.MouseEvent) => void;
  onDecrement: (event: React.MouseEvent) => void;
};

export function nutritionChips(product: FoodCardNutrition): string[] {
  const chips: string[] = [];
  if (product.weightGrams != null) chips.push(`${product.weightGrams} г`);
  if (product.calories != null) chips.push(`${product.calories} ккал`);
  if (product.proteins != null) chips.push(`Б ${product.proteins} г`);
  if (product.fats != null) chips.push(`Ж ${product.fats} г`);
  if (product.carbs != null) chips.push(`У ${product.carbs} г`);
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
  eager = false,
  onOpen,
  onAdd,
  onIncrement,
  onDecrement,
}: FoodCardProps) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const chips = nutritionChips(product);
  const openLabel = `Открыть ${product.name}, ${product.price} руб.`;
  const showImage = Boolean(product.image) && failedSrc !== product.image;

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
            {showImage ? (
              // Direct S3 URL — Next optimizer times out on twcstorage.
              // Never loading="lazy": Chrome Android unloads lazy images during
              // fling, so the media well flashes as a skeleton on scroll-back.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image!}
                alt={product.name}
                className="food-card__img"
                loading="eager"
                fetchPriority={eager ? "high" : "auto"}
                decoding="async"
                draggable={false}
                onError={() => setFailedSrc(product.image)}
              />
            ) : (
              <span className="food-card__fallback" aria-hidden>
                {product.name[0]}
              </span>
            )}
            {product.categoryName ? (
              <span className="food-card__badge">{product.categoryName}</span>
            ) : null}
            {isNewProduct(product.createdAt) ? (
              <span className="food-card__badge food-card__badge--new">Новинка</span>
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
      </div>

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
    </article>
  );
}

export function FoodCardSkeleton() {
  return <div className="food-card-skeleton animate-pulse" aria-hidden />;
}
