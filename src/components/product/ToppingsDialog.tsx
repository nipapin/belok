'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { toppingCartItems, toppingOptions, type ToppingProduct } from '@/lib/toppings';
import type { CartItem } from '@/store/cartStore';
import './toppings-dialog.css';

type CartDraft = Omit<CartItem, 'id'>;
export default function ToppingsDialog({ item, toppings, onConfirm, onClose }: {
  item: CartDraft;
  toppings: ToppingProduct[];
  onConfirm: (items: CartDraft[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);
  const titleId = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const options = toppingOptions(toppings);
  const extras = toppingCartItems(toppings, selected, item.quantity);
  const total = (item.basePrice + item.customizations.reduce((sum, choice) => sum + choice.priceDelta, 0)) * item.quantity + extras.reduce((sum, extra) => sum + extra.basePrice * extra.quantity, 0);
  const money = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  function confirm(withToppings: boolean) {
    if (confirmed.current) return;
    confirmed.current = true;
    onConfirm([item, ...(withToppings ? extras : [])]);
  }

  if (typeof document === 'undefined') return null;
  return createPortal(<dialog ref={dialog} className="toppings-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header className="toppings-dialog-header">
      <div><p className="toppings-dialog-eyebrow">{item.name}{item.quantity > 1 ? ` · ${item.quantity} шт.` : ''}</p><h2 id={titleId}>Что добавить к блюду?</h2><p className="toppings-dialog-hint">Можно выбрать несколько</p></div>
      <button type="button" className="btn-icon size-11 shrink-0" onClick={onClose} aria-label="Закрыть выбор топпингов"><X size={21} /></button>
    </header>
    <div className="toppings-dialog-options">
      {options.map((option) => <label key={option.key} className={`topping-choice${selected.has(option.key) ? ' is-selected' : ''}`}>
        <input type="checkbox" checked={selected.has(option.key)} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(option.key)) next.delete(option.key); else next.add(option.key); return next; })} />
        {/* Catalog images can use local upload URLs or external storage. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {option.image ? <img src={option.image} alt="" className="topping-choice-image" /> : null}
        <span className="topping-choice-name">{option.name}</span><span className="topping-choice-price">+{money(option.price * item.quantity)} ₽</span><span className="topping-choice-check" aria-hidden="true">{selected.has(option.key) && <Check size={16} />}</span>
      </label>)}
    </div>
    <footer className="toppings-dialog-actions">
      <button type="button" className="btn-primary" onClick={() => confirm(true)}>Добавить · {money(total)} ₽</button>
      <button type="button" className="toppings-dialog-skip" onClick={() => confirm(false)}>Спасибо, не надо</button>
    </footer>
  </dialog>, document.body);
}
