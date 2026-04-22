"use client";

import { Category } from "@/types";
import { useRouter } from "next/navigation";

export default function CategoryChip({ category, selected }: { category: Category; selected?: boolean }) {
  const router = useRouter();
  const { id, name } = category;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        router.push(`/menu?category=${id}`);
      }}
      className={`flex min-h-11 w-28 shrink-0 items-center justify-center wrap-break-word px-1.5 py-2 text-center text-sm font-semibold leading-tight transition line-clamp-2 lg-chip lg-interactive lg-pill ${
        selected ? "lg-active" : ""
      }`}
    >
      {name}
    </button>
  );
}
