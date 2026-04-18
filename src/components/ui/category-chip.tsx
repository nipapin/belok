"use client";

import { Category } from "@/types";
import { useRouter } from "next/navigation";

export default function CategoryChip({ category, selected }: { category: Category; selected?: boolean }) {
  const router = useRouter();
  const { id, name } = category;
  return (
    <button
      type="button"
      onClick={() => router.push(`/menu?category=${id}`)}
      className={`shrink-0 px-4 py-2.5 text-center text-sm font-semibold transition lg-chip lg-interactive lg-pill ${
        selected ? "lg-active" : ""
      }`}
    >
      {name}
    </button>
  );
}
