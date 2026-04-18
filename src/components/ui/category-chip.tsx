"use client";

import { Category } from "@/types";
import { useRouter } from "next/navigation";

export default function CategoryChip({ category }: { category: Category }) {
  const router = useRouter();
  const { id, name } = category;
  return (
    <button
      type="button"
      onClick={() => router.push(`/menu?category=${id}`)}
      className="shrink-0 rounded-full glass-effect glass-border px-4 py-2.5 text-sm font-medium text-white text-center shadow-sm"
    >
      {name}
    </button>
  );
}
