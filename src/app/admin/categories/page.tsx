'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';

interface Category {
  id: string;
  name: string;
  image: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number };
}

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', sortOrder: 0, isActive: true });

  const { data } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => fetch('/api/admin/categories').then((r) => r.json()),
  });
  const categories: Category[] = data?.categories ?? [];

  const saveMutation = useMutation({
    mutationFn: async (d: typeof form) => {
      const url = editing ? `/api/admin/categories/${editing.id}` : '/api/admin/categories';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      handleClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-categories'] }),
  });

  const handleOpen = (cat?: Category) => {
    if (cat) {
      setEditing(cat);
      setForm({ name: cat.name, sortOrder: cat.sortOrder, isActive: cat.isActive });
    } else {
      setEditing(null);
      setForm({ name: '', sortOrder: 0, isActive: true });
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
        <h1 className="heading-section m-0">Категории</h1>
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
                <th>Товаров</th>
                <th>Порядок</th>
                <th>Статус</th>
                <th className="text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td>{cat._count.products}</td>
                  <td>{cat.sortOrder}</td>
                  <td>
                    <span
                      className={
                        cat.isActive
                          ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                          : 'admin-chip-neutral'
                      }
                    >
                      {cat.isActive ? 'Активна' : 'Скрыта'}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn-icon mr-1 inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
                      onClick={() => handleOpen(cat)}
                      aria-label="Изменить"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon inline-flex size-9 border-0 bg-transparent text-rose-600 shadow-none hover:bg-rose-50"
                      onClick={() => {
                        if (cat._count.products > 0) {
                          window.alert('Нельзя удалить категорию с товарами');
                          return;
                        }
                        if (window.confirm('Удалить категорию?')) deleteMutation.mutate(cat.id);
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
        {categories.map((cat) => (
          <div key={cat.id} className="glass-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-(--lg-text)">{cat.name}</p>
              <span
                className={
                  cat.isActive
                    ? 'shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                    : 'admin-chip-neutral shrink-0'
                }
              >
                {cat.isActive ? 'Активна' : 'Скрыта'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-(--lg-text-muted)">Товаров</span>
                <span className="ml-2 font-medium tabular-nums text-(--lg-text)">{cat._count.products}</span>
              </div>
              <div>
                <span className="text-(--lg-text-muted)">Порядок</span>
                <span className="ml-2 font-medium tabular-nums text-(--lg-text)">{cat.sortOrder}</span>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-1 border-t border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] pt-3">
              <button
                type="button"
                className="btn-icon inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
                onClick={() => handleOpen(cat)}
                aria-label="Изменить"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                className="btn-icon inline-flex size-9 border-0 bg-transparent text-rose-600 shadow-none hover:bg-rose-50"
                onClick={() => {
                  if (cat._count.products > 0) {
                    window.alert('Нельзя удалить категорию с товарами');
                    return;
                  }
                  if (window.confirm('Удалить категорию?')) deleteMutation.mutate(cat.id);
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
        title={editing ? 'Редактировать категорию' : 'Новая категория'}
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
            Порядок сортировки
            <input
              className="input-pill mt-1"
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value, 10) || 0 })}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-(--lg-text)">
            <input
              type="checkbox"
              className="size-4 rounded border-(--lg-ring) accent-[#18181b]"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Активна
          </label>
        </div>
      </Modal>
    </div>
  );
}
