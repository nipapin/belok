'use client';

import { useEffect, useId, useRef } from 'react';
import { Bike } from 'lucide-react';

export default function DeliveryFeeNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="glass-panel-strong fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl p-6 text-(--lg-text) shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" aria-hidden="true">
        <Bike className="size-6" strokeWidth={1.75} />
      </div>
      <h2 id={titleId} className="text-xl font-semibold leading-snug tracking-tight">Доставка оплачивается отдельно</h2>
      <p id={descriptionId} className="mt-3 text-base leading-relaxed text-(--lg-text-muted)">
        Стоимость доставки не включена в сумму заказа. Мы уточним её и сообщим вам по телефону.
      </p>
      <button type="button" className="btn-primary mt-6 min-h-12 w-full" autoFocus onClick={onClose}>Понятно</button>
    </dialog>
  );
}
