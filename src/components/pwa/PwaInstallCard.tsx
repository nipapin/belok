"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { isStandalonePwa } from "@/lib/clientPlatform";
import { requestPwaGuide } from "@/lib/pwaInstall";
import { useHaptic } from "@/hooks/useHaptic";

export default function PwaInstallCard() {
  const haptic = useHaptic();
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    setStandalone(isStandalonePwa());
    const media = window.matchMedia?.("(display-mode: standalone)");
    const onChange = () => setStandalone(isStandalonePwa());
    media?.addEventListener?.("change", onChange);
    return () => media?.removeEventListener?.("change", onChange);
  }, []);

  if (standalone) return null;

  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        requestPwaGuide();
      }}
      className="glass-panel lg-interactive mb-2 flex w-full cursor-pointer items-center gap-3 p-4 text-left"
    >
      <Smartphone className="size-5 shrink-0 text-(--lg-text-muted)" strokeWidth={1.75} />
      <span className="min-w-0">
        <span className="block font-medium text-(--lg-text)">Установить на рабочий стол</span>
        <span className="mt-0.5 block text-xs text-(--lg-text-muted)">
          Уведомления и меню всегда под рукой
        </span>
      </span>
    </button>
  );
}
