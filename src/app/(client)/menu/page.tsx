import { MenuPageInner } from "@/components/layout/MenuPageInner";
import { Suspense } from "react";

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-(--lg-text-muted)">Загрузка…</div>}>
      <MenuPageInner />
    </Suspense>
  );
}
