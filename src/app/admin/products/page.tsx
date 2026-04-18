'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';

interface Ingredient {
  id: string;
  name: string;
  price: number;
}

interface ProductIngredient {
  ingredientId: string;
  ingredient: Ingredient;
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  categoryId: string;
  isAvailable: boolean;
  calories: number | null;
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  sortOrder: number;
  category: { id: string; name: string };
  ingredients: ProductIngredient[];
}

interface Category {
  id: string;
  name: string;
}

const emptyForm = {
  name: '',
  description: '',
  price: '',
  image: '',
  categoryId: '',
  isAvailable: true,
  calories: '',
  proteins: '',
  fats: '',
  carbs: '',
  sortOrder: 0,
  ingredientIds: [] as string[],
};

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const { data: productsData } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => fetch('/api/admin/products').then((r) => r.json()),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => fetch('/api/admin/categories').then((r) => r.json()),
  });

  const { data: ingredientsData } = useQuery({
    queryKey: ['admin-ingredients'],
    queryFn: () => fetch('/api/admin/ingredients').then((r) => r.json()),
  });

  const products: Product[] = productsData?.products ?? [];
  const categories: Category[] = categoriesData?.categories ?? [];
  const ingredients: Ingredient[] = ingredientsData?.ingredients ?? [];

  const toggleIngredient = (id: string) => {
    setForm((f) => ({
      ...f,
      ingredientIds: f.ingredientIds.includes(id)
        ? f.ingredientIds.filter((x) => x !== id)
        : [...f.ingredientIds, id],
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form & { image?: string }) => {
      let imageUrl = data.image || editing?.image || '';

      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
        const uploadData = await uploadRes.json();
        if (uploadRes.ok) imageUrl = uploadData.url;
      }

      const body = {
        ...data,
        image: imageUrl,
        ingredients: data.ingredientIds.map((ingredientId: string) => ({
          ingredientId,
          isDefault: true,
          isRemovable: true,
          isExtra: false,
        })),
      };

      const url = editing ? `/api/admin/products/${editing.id}` : '/api/admin/products';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      handleClose();
    },
    onError: () => setError('Ошибка сохранения'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/products/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
  });

  const handleOpen = (product?: Product) => {
    if (product) {
      setEditing(product);
      setForm({
        name: product.name,
        description: product.description || '',
        price: product.price.toString(),
        image: product.image || '',
        categoryId: product.categoryId,
        isAvailable: product.isAvailable,
        calories: product.calories?.toString() || '',
        proteins: product.proteins?.toString() || '',
        fats: product.fats?.toString() || '',
        carbs: product.carbs?.toString() || '',
        sortOrder: product.sortOrder,
        ingredientIds: product.ingredients.map((pi) => pi.ingredientId),
      });
    } else {
      setEditing(null);
      setForm(emptyForm);
    }
    setImageFile(null);
    setError('');
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setError('');
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-section m-0">Товары</h1>
        <button type="button" className="btn-primary gap-2 py-2.5 text-sm" onClick={() => handleOpen()}>
          <Plus className="size-4" />
          Добавить
        </button>
      </div>

      <div className="admin-table-wrap overflow-x-auto">
        <table className="admin-table min-w-[720px]">
          <thead>
            <tr>
              <th>Название</th>
              <th>Категория</th>
              <th>Цена</th>
              <th>В меню</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="flex items-center gap-2">
                    {product.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image}
                        alt=""
                        className="size-10 rounded-xl object-cover"
                      />
                    )}
                    <span className="font-medium">{product.name}</span>
                  </div>
                </td>
                <td>
                  <span className="admin-chip-neutral font-medium">{product.category.name}</span>
                </td>
                <td>{product.price} ₽</td>
                <td>
                  <span
                    className={
                      product.isAvailable
                        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                        : 'admin-chip-neutral'
                    }
                  >
                    {product.isAvailable ? 'Да' : 'Нет'}
                  </span>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-icon mr-1 inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
                    onClick={() => handleOpen(product)}
                    aria-label="Изменить"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="btn-icon inline-flex size-9 border-0 bg-transparent text-rose-600 shadow-none hover:bg-rose-50"
                    onClick={() => {
                      if (window.confirm('Удалить товар?')) deleteMutation.mutate(product.id);
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

      <Modal
        wide
        open={open}
        onClose={handleClose}
        title={editing ? 'Редактировать товар' : 'Новый товар'}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={handleClose}>
              Отмена
            </button>
            <button
              type="button"
              className="btn-primary px-5 py-2 text-sm"
              onClick={() => saveMutation.mutate(form)}
              disabled={!form.name || !form.price || !form.categoryId}
            >
              {editing ? 'Сохранить' : 'Создать'}
            </button>
          </>
        }
      >
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
          {error && <div className="auth-alert-error">{error}</div>}
          <label className="text-sm font-medium text-(--lg-text)">
            Название <span className="text-rose-600">*</span>
            <input
              className="input-pill mt-1"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-(--lg-text)">
            Описание
            <textarea
              className="glass-tight mt-1 min-h-[72px] w-full resize-none px-4 py-3 text-sm text-(--lg-text) outline-none focus:border-(--lg-ring-strong) focus:ring-2 focus:ring-[color-mix(in_srgb,var(--lg-text)_10%,transparent)]"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-(--lg-text)">
              Цена (₽) <span className="text-rose-600">*</span>
              <input
                className="input-pill mt-1"
                type="number"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label className="text-sm font-medium text-(--lg-text)">
              Категория <span className="text-rose-600">*</span>
              <select
                className="input-pill mt-1 cursor-pointer"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Выберите…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ['calories', 'Ккал'],
                ['proteins', 'Белки, г'],
                ['fats', 'Жиры, г'],
                ['carbs', 'Углеводы, г'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="text-xs font-medium text-(--lg-text)">
                {label}
                <input
                  className="input-pill mt-1 py-2 text-sm"
                  type="number"
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-(--lg-text)">Ингредиенты в составе</p>
            <div className="glass-tight max-h-40 space-y-1 overflow-y-auto p-2">
              {ingredients.map((ing) => (
                <label
                  key={ing.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-[color-mix(in_srgb,var(--lg-text)_5%,transparent)]"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-(--lg-ring) accent-[#18181b]"
                    checked={form.ingredientIds.includes(ing.id)}
                    onChange={() => toggleIngredient(ing.id)}
                  />
                  <span>
                    {ing.name} <span className="text-(--lg-text-muted)">(+{ing.price} ₽)</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-(--lg-text)">Изображение</p>
            <input
              type="file"
              accept="image/*"
              className="text-sm text-(--lg-text-muted) file:mr-3 file:rounded-full file:border-0 file:bg-[#18181b] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
          </div>
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
