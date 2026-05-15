'use client';

import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';

type ConfirmDialogVariant = 'destructive' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Если задан — рендерится кнопка подтверждения. Иначе диалог информационный (одна «OK»). */
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  loading?: boolean;
  onConfirm?: () => void;
}

export default function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Отмена',
  variant = 'destructive',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, loading]);

  if (!open) return null;

  const isDestructive = variant === 'destructive';
  const Icon = isDestructive ? AlertTriangle : Info;
  const iconWrapClass = isDestructive
    ? 'bg-rose-500/14 text-rose-500 ring-1 ring-rose-500/24'
    : 'bg-sky-500/14 text-sky-500 ring-1 ring-sky-500/24';

  return (
    <div className="fixed inset-0 z-1400 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        aria-label="Закрыть"
        onClick={() => !loading && onClose()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-description' : undefined}
        className="glass-panel-strong relative z-1 w-full max-w-md rounded-3xl p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${iconWrapClass}`}
            aria-hidden
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-base font-semibold tracking-tight text-(--lg-text)"
            >
              {title}
            </h2>
            {description && (
              <div
                id="confirm-dialog-description"
                className="mt-1.5 text-sm leading-relaxed text-(--lg-text-muted)"
              >
                {description}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {confirmLabel ? (
            <>
              <button
                type="button"
                className="btn-ghost"
                onClick={onClose}
                disabled={loading}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className={
                  isDestructive
                    ? 'btn-destructive inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-60'
                    : 'btn-primary px-5 py-2.5 text-sm'
                }
                onClick={onConfirm}
                disabled={loading || !onConfirm}
                autoFocus
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                {confirmLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary px-5 py-2.5 text-sm"
              onClick={onClose}
              autoFocus
            >
              Понятно
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
