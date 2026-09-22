import { Suspense } from "react";
import { redirect } from "next/navigation";
import { HomePageInner } from "@/components/layout/HomePageInner";
import { isHomePublished } from "@/lib/homeVisibility";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!(await isHomePublished())) {
    const params = await searchParams;
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") qs.append(key, value);
      else if (Array.isArray(value)) {
        for (const item of value) qs.append(key, item);
      }
    }
    const query = qs.toString();
    redirect(query ? `/menu?${query}` : "/menu");
  }

  return (
    <Suspense fallback={<div className="pt-2 px-2 py-12 text-center text-(--lg-text-muted)">Загрузка…</div>}>
      <HomePageInner />
    </Suspense>
  );
}
