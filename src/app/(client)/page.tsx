"use client";

import { Suspense } from "react";
import { HomePageInner } from "@/components/layout/HomePageInner";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="pt-2 px-2 py-12 text-center text-(--lg-text-muted)">Загрузка…</div>}>
      <HomePageInner />
    </Suspense>
  );
}
