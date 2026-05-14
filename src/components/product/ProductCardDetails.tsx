import { ProductCardModel } from "./ProductCard";

export function ProductCardDetails({ product }: { product: ProductCardModel }) {
  return (
    <div className={"flex flex-col gap-0.25 items-start w-full p-2"}>
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
