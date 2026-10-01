"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

export type FoodCardVariant = {
  id: string;
  name: string;
  image: string | null;
};

export type FoodCardModel = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  categoryName?: string | null;
  createdAt?: string | null;
  variantId?: string | null;
  variants?: FoodCardVariant[];
} & FoodCardNutrition;

type FoodCardProps = {
  product: FoodCardModel;
  quantity: number;
  busy?: boolean;
  eager?: boolean;
  flavor?: string | null;
  onOpen: () => void;
  onAdd: (event: React.MouseEvent) => void;
  onIncrement: (event: React.MouseEvent) => void;
  onDecrement: (event: React.MouseEvent) => void;
  onPrevFlavor?: () => void;
  onNextFlavor?: () => void;
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
  flavor = null,
  onOpen,
  onAdd,
  onIncrement,
  onDecrement,
  onPrevFlavor,
  onNextFlavor,
}: FoodCardProps) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const chips = nutritionChips(product);
  const labelName = flavor ? `${product.name}, ${flavor}` : product.name;
  const openLabel = `Открыть ${labelName}, ${product.price} руб.`;
  const showImage = Boolean(product.image) && failedSrc !== product.image;
  const showFlavorNav = Boolean(onPrevFlavor && onNextFlavor);

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
        <div className="food-card__stage">
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
                alt={labelName}
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
            {flavor ? <p className="food-card__flavor">{flavor}</p> : null}
            {chips.length > 0 ? (
              <div className="food-card__chips">
                {chips.map((label) => (
                  <NutritionChip key={label} label={label} />
                ))}
              </div>
            ) : null}
          </div>
        </button>
        {showFlavorNav ? (
          <div className="food-card__navs">
            <button
              type="button"
              className="food-card__nav food-card__nav--prev"
              aria-label={`Предыдущий вкус ${product.name}`}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onPrevFlavor?.();
              }}
            >
              <ChevronLeft className="size-5" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              className="food-card__nav food-card__nav--next"
              aria-label={`Следующий вкус ${product.name}`}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onNextFlavor?.();
              }}
            >
              <ChevronRight className="size-5" strokeWidth={2.25} />
            </button>
          </div>
        ) : null}
        </div>
      </div>

      <div
        className="food-card__footer"
        onClick={(event) => event.stopPropagation()}
      >
        <PriceCTA
          price={product.price}
          quantity={quantity}
          busy={busy}
          addLabel={`Добавить ${labelName} в корзину`}
          incrementLabel={`Добавить ещё ${labelName}`}
          decrementLabel={`Убрать ${labelName} из корзины`}
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
