"use client";

import { brandMark } from "@/lib/brand";
import { useRouter } from "next/navigation";

export default function Header() {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-1100 px-4">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="outline-none focus:outline-none rounded-full text-left transition px-4 py-1 glass-effect mt-2 glass-border"
      >
        <span className="heading-display lowercase tracking-[-0.04em] text-white">{brandMark}</span>
      </button>
    </header>
  );
}
