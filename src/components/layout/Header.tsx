"use client";

import { brandMark } from "@/lib/brand";
import ThemeToggle from "@/components/ui/ThemeToggle";
import SearchControl from "@/components/layout/SearchControl";
import { useHomePublished } from "@/hooks/useHomePublished";
import Link from "next/link";

export default function Header() {
  const { published } = useHomePublished();

  return (
    <header className="fixed top-0 z-1100 w-full px-4">
      <div className="lg-bar mt-2 flex items-center justify-between gap-2 px-3 py-2 pl-4 sm:pl-5">
        <Link href={published ? "/" : "/menu"} className="outline-none focus:outline-none min-w-0 flex-1 rounded-full text-left transition">
          <span className="heading-display">{brandMark}</span>
        </Link>
        <SearchControl />
        <ThemeToggle />
      </div>
    </header>
  );
}
