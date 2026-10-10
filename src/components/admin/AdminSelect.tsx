'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type Option = { value: string; label: string };

export default function AdminSelect({ value, onChange, options, ariaLabel }: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const selected = options.find(option => option.value === value);
  return (
    <div className="relative mt-1" ref={root} onKeyDown={e => {
      if (e.key === 'Escape') { setOpen(false); e.stopPropagation(); }
      if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); }
    }}>
      <button type="button" aria-label={ariaLabel} aria-expanded={open}
        aria-haspopup="listbox"
        className="inventory-field inventory-select-trigger"
        onClick={() => setOpen(!open)}>
        <span>{selected?.label ?? 'Выберите значение'}</span>
        <ChevronDown size={17} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label={ariaLabel}
          className="inventory-select-menu absolute left-0 right-0 z-40 mt-2 overflow-auto rounded-2xl p-1.5 shadow-xl">
          {options.map(option => (
            <button key={option.value} type="button" role="option"
              aria-selected={option.value === value}
              className="inventory-select-option flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm"
              onClick={() => { onChange(option.value); setOpen(false); }}>
              <span>{option.label}</span>
              {option.value === value && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
