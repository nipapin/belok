"use client";

import { brandMark } from "@/lib/brand";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ui/ThemeToggle";
import SearchControl from "@/components/layout/SearchControl";

export default function Header() {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-1100 px-4">
      <div className="lg-bar mt-2 flex items-center justify-between gap-2 px-3 py-2 pl-4 sm:pl-5">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="outline-none focus:outline-none min-w-0 flex-1 rounded-full text-left transition lg-interactive"
        >
          <span className="heading-display">{brandMark}</span>
        </button>
        <SearchControl />
        <ThemeToggle />
      </div>
    </header>
  );
}
