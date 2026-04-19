'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';

interface Ingredient {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  _count: { products: number };
}

export default function AdminIngredientsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState({ name: '', price: '0', isAvailable: true });

  const { data } = useQuery({
    queryKey: ['admin-ingredients'],
    queryFn: () => fetch('/api/admin/ingredients').then((r) => r.json()),
  });
  const ingredients: Ingredient[] = data?.ingredients ?? [];

  const saveMutation = useMutation({
    mutationFn: async (d: typeof form) => {
      const url = editing ? `/api/admin/ingredients/${editing.id}` : '/api/admin/ingredients';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ingredients'] });
      handleClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/ingredients/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ingredients'] }),
  });

  const handleOpen = (ing?: Ingredient) => {
    if (ing) {
      setEditing(ing);
      setForm({ name: ing.name, price: ing.price.toString(), isAvailable: ing.isAvailable });
    } else {
      setEditing(null);
      setForm({ name: '', price: '0', isAvailable: true });
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditing(null);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-section m-0">Ингредиенты</h1>
        <button type="button" className="btn-primary gap-2 py-2.5 text-sm" onClick={() => handleOpen()}>
          <Plus className="size-4" />
          Добавить
        </button>
      </div>

      <div className="hidden min-[900px]:block">
        <div className="admin-table-wrap overflow-x-auto">
          <table className="admin-table min-w-[640px]">
            <thead>
              <tr>
                <th>Название</th>
                <th>Цена</th>
                <th>В блюдах</th>
                <th>Статус</th>
                <th className="text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing) => (
                <tr key={ing.id}>
                  <td>{ing.name}</td>
                  <td>{ing.price} ₽</td>
                  <td>{ing._count.products}</td>
                  <td>
                    <span
                      className={
                        ing.isAvailable
                          ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                          : 'admin-chip-neutral'
                      }
                    >
                      {ing.isAvailable ? 'Доступен' : 'Скрыт'}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn-icon mr-1 inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
                      onClick={() => handleOpen(ing)}
                      aria-label="Изменить"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon inline-flex size-9 border-0 bg-transparent text-rose-600 shadow-none hover:bg-rose-50"
                      onClick={() => {
                        if (window.confirm('Удалить ингредиент?')) deleteMutation.mutate(ing.id);
                      }}
                      aria-label="Удалить"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 min-[900px]:hidden">
        {ingredients.map((ing) => (
          <div key={ing.id} className="glass-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-(--lg-text)">{ing.name}</p>
              <span
                className={
                  ing.isAvailable
                    ? 'shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                    : 'admin-chip-neutral shrink-0'
                }
              >
                {ing.isAvailable ? 'Доступен' : 'Скрыт'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-(--lg-text-muted)">Цена</span>
                <span className="ml-2 font-medium tabular-nums text-(--lg-text)">{ing.price} ₽</span>
              </div>
              <div>
                <span className="text-(--lg-text-muted)">В блюдах</span>
                <span className="ml-2 font-medium tabular-nums text-(--lg-text)">{ing._count.products}</span>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-1 border-t border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] pt-3">
              <button
                type="button"
                className="btn-icon inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
                onClick={() => handleOpen(ing)}
                aria-label="Изменить"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                className="btn-icon inline-flex size-9 border-0 bg-transparent text-rose-600 shadow-none hover:bg-rose-50"
                onClick={() => {
                  if (window.confirm('Удалить ингредиент?')) deleteMutation.mutate(ing.id);
                }}
                aria-label="Удалить"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={handleClose}
        title={editing ? 'Редактировать ингредиент' : 'Новый ингредиент'}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={handleClose}>
              Отмена
            </button>
            <button
              type="button"
              className="btn-primary px-5 py-2 text-sm"
              onClick={() => saveMutation.mutate(form)}
              disabled={!form.name}
            >
              {editing ? 'Сохранить' : 'Создать'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-(--lg-text)">
            Название
            <input
              className="input-pill mt-1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-(--lg-text)">
            Цена (₽)
            <input
              className="input-pill mt-1"
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-(--lg-text)">
            <input
              type="checkbox"
              className="size-4 rounded border-(--lg-ring) accent-[#18181b]"
              checked={form.isAvailable}
              onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
            />
            Доступен для заказа
          </label>
        </div>
      </Modal>
    </div>
  );
}
