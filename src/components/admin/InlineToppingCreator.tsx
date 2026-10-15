'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseNewTopping } from '@/lib/toppings';
import type { AdminProduct } from './AdminProductForm';

export default function InlineToppingCreator({ disabled, onCreated, onBusyChange }: {
  disabled: boolean;
  onCreated: (product: AdminProduct) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      const draft = parseNewTopping({ name, price });
      if (!draft) throw new Error('Укажите название и корректную цену');
      const response = await fetch('/api/admin/products/toppings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.product) throw new Error(data?.error ?? 'Не удалось создать топпинг');
      return data.product as AdminProduct;
    },
    onMutate: () => onBusyChange(true),
    onSuccess: (product) => {
      queryClient.setQueryData<{ products: AdminProduct[] }>(['admin-products', 'toppings'], (current) => ({ products: [...(current?.products ?? []), product] }));
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-products-v2'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      onCreated(product);
      setName(''); setPrice(''); setOpen(false);
    },
    onSettled: () => onBusyChange(false),
  });
  if (!open) return <button type="button" className="btn-outline mt-4 min-h-11 text-sm" disabled={disabled} onClick={() => { create.reset(); setOpen(true); }}><Plus size={17} />Новый топпинг</button>;
  return <form aria-label="Новый топпинг" className="mt-4 rounded-2xl border border-(--lg-ring) bg-(--lg-fill) p-4" onSubmit={(event) => { event.preventDefault(); if (!create.isPending && parseNewTopping({ name, price })) create.mutate(); }}>
    <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Новый топпинг</h3><button type="button" className="btn-icon size-9" disabled={create.isPending} onClick={() => setOpen(false)} aria-label="Отменить создание топпинга"><X size={17} /></button></div>
    <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3">
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium"><span>Название</span><input className="input-pill w-full min-w-0 !rounded-xl !px-3 !py-3 !text-sm" autoFocus maxLength={120} placeholder="Например, карамель" value={name} disabled={create.isPending} onChange={(event) => setName(event.target.value)} required /></label>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium"><span>Цена, ₽</span><input className="input-pill w-full min-w-0 !rounded-xl !px-3 !py-3 !text-sm" inputMode="decimal" placeholder="0" value={price} disabled={create.isPending} onChange={(event) => setPrice(event.target.value)} required /></label>
    </div>
    {create.isError && <p role="alert" className="mt-3 text-sm text-rose-600">{create.error.message}</p>}
    <button type="submit" className="btn-primary mt-4 min-h-11 w-full text-sm" disabled={create.isPending || !parseNewTopping({ name, price })}>{create.isPending ? 'Создаём…' : 'Создать и выбрать'}</button>
  </form>;
}
