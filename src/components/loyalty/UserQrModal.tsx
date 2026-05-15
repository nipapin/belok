"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { X } from "lucide-react";
import { useHydrated } from "@/hooks/useHydrated";

interface UserQrModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName?: string | null;
  /** Подзаголовок над QR-кодом. По умолчанию «Карта лояльности». */
  title?: string;
  /** Подпись под QR-кодом. */
  hint?: string;
}

export default function UserQrModal({
  open,
  onClose,
  userId,
  userName,
  title = "Карта лояльности",
  hint = "Покажите QR-код на кассе для начисления бонусов",
}: UserQrModalProps) {
  const [svg, setSvg] = useState<string>("");
  const portalReady = useHydrated();

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    QRCode.toString(userId, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 1,
      color: { dark: "#0a0a0a", light: "#ffffffff" },
    }).then((s) => {
      if (!cancelled) setSvg(s);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!portalReady || !open) return null;

  return createPortal(
    <div
      data-mobile-ui
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-qr-dialog-title"
      className="search-modal-backdrop fixed inset-0 z-1500 flex items-center justify-center p-4 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="glass-panel-strong relative w-full max-w-md rounded-3xl p-6 shadow-(--lg-shadow-strong)"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="btn-icon absolute right-3 top-3 size-9 min-h-0 min-w-0 shrink-0"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <X className="size-4" strokeWidth={2} />
        </button>

        <h2 id="user-qr-dialog-title" className="text-center text-base font-semibold tracking-tight text-(--lg-text)">
          {title}
        </h2>
        {userName && <p className="mt-1 text-center text-xs text-(--lg-text-muted)">{userName}</p>}

        <div className="mx-auto mt-5 aspect-square w-full max-w-80 rounded-2xl bg-white p-4 shadow-xl">
          {svg ? (
            <span className="block size-full [&>svg]:size-full" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <span className="block size-full animate-pulse rounded-lg bg-zinc-100" aria-hidden />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-(--lg-text-muted)">{hint}</p>
      </div>
    </div>,
    document.body,
  );
}
