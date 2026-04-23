import { cn } from "@/lib/tailwind";
import { ProductCardModel } from "./ProductCard";

export function ProductCardDetails({ product }: { product: ProductCardModel }) {
  return (
    <div className={cn("absolute bottom-[-2px] left-px -right-px p-2 flex flex-col gap-0.25 items-start glass-fx rounded-2xl pb-5")}>
      <p className="text-sm font-semibold leading-snug text-white">{product.name}</p>
      {product.calories != null && (
        <p className="text-xs text-white/75">
          {product.calories} ккал
          {product.proteins != null && <span> · Б {product.proteins} г</span>}
        </p>
      )}
      <p className="text-base font-bold text-white">{product.price} ₽</p>
    </div>
  );
}
