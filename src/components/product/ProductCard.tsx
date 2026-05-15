"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { ProductCardDetails } from "./ProductCardDetails";
import Image from "next/image";

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
    <div className="relative h-full aspect-2/3 overflow-hidden rounded-2xl glass-fx">
      <button
        type="button"
        onClick={() => router.push(`/menu/${product.id}`)}
        className="w-full h-full flex flex-col items-center"
      >
        <div className="w-full h-auto aspect-square overflow-hidden bg-white rounded-bl-2xl rounded-br-2xl">
          {product.image ? (
            <Image src={product.image} alt={product.name} width={200} height={200} className="w-full h-full object-cover" />
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
        className={
          "absolute right-2 bottom-2 rounded-full p-2 glass-fx flex items-center justify-center border border-solid border-surface-edge-strong"
        }
      >
        {justAdded ? (
          <Check className="text-white" strokeWidth={2.5} />
        ) : (
          <Plus className="text-white" strokeWidth={2.25} />
        )}
      </button>
    </div>
  );
}
