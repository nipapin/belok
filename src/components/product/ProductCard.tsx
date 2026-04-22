"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { ProductCardDetails } from "./ProductCardDetails";

export type ProductCardModel = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  calories: number | null;
  proteins: number | null;
};

type ProductCardProps = {
  product: ProductCardModel;
};

export function ProductCard({ product }: ProductCardProps) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const [justAdded, setJustAdded] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      basePrice: product.price,
      quantity: 1,
      customizations: [],
    });
    setJustAdded(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustAdded(false), 700);
  }

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={() => router.push(`/menu/${product.id}`)}
        className="w-full h-full overflow-hidden rounded-2xl aspect-2/3"
      >
        <div className="w-full h-full">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="">{product.name[0]}</span>
          )}
        </div>
        <ProductCardDetails product={product} />
      </button>
      <button
        type="button"
        onClick={handleAdd}
        aria-label={`Добавить ${product.name} в корзину`}
        aria-pressed={justAdded}
        className={"absolute right-2 bottom-2 rounded-full p-2 glass-fx flex items-center justify-center border border-solid border-surface-edge-strong"}
      >
        {justAdded ? <Check className="text-(--lg-text)" strokeWidth={2.5} /> : <Plus className="text-(--lg-text)" strokeWidth={2.25} />}
      </button>
    </div>
  );
}
