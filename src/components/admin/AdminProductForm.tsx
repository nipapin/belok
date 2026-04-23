'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminProductImageField from '@/components/admin/AdminProductImageField';
import Switch from '@/components/ui/Switch';

interface Ingredient {
  id: string;
  name: string;
  price: number;
}

export interface ProductIngredient {
  ingredientId: string;
  ingredient: Ingredient;
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
}

export interface AdminProduct {
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
  fiber: number | null;
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
  fiber: '',
  sortOrder: 0,
  ingredientIds: [] as string[],
};

type FormState = typeof emptyForm;

type AdminProductFormProps = {
  mode: 'new' | 'edit';
  productId?: string;
};

export default function AdminProductForm({ mode, productId }: AdminProductFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data: productRes, isLoading: productLoading, isError: productError } = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/products/${productId}`);
      if (r.status === 404) return { product: null as AdminProduct | null };
      if (!r.ok) throw new Error('load');
      return r.json() as Promise<{ product: AdminProduct }>;
    },
    enabled: mode === 'edit' && Boolean(productId),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => fetch('/api/admin/categories').then((r) => r.json()),
  });

  const { data: ingredientsData } = useQuery({
    queryKey: ['admin-ingredients'],
    queryFn: () => fetch('/api/admin/ingredients').then((r) => r.json()),
  });

  const product = productRes?.product ?? null;
  const categories: Category[] = categoriesData?.categories ?? [];
  const ingredients: Ingredient[] = ingredientsData?.ingredients ?? [];

  useLayoutEffect(() => {
    if (mode !== 'edit' || !product) return;
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
      fiber: product.fiber?.toString() || '',
      sortOrder: product.sortOrder,
      ingredientIds: product.ingredients.map((pi) => pi.ingredientId),
    });
    setImageFile(null);
  }, [mode, product]);

  useEffect(() => {
    if (!imageFile) {
      setFilePreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(imageFile);
    setFilePreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [imageFile]);

  const currentImageUrl = filePreviewUrl || form.image || null;

  const clearProductImage = () => {
    setImageFile(null);
    setForm((f) => ({ ...f, image: '' }));
  };

  const toggleIngredient = (id: string) => {
    setForm((f) => ({
      ...f,
      ingredientIds: f.ingredientIds.includes(id)
        ? f.ingredientIds.filter((x) => x !== id)
        : [...f.ingredientIds, id],
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async (data: FormState & { image?: string }) => {
      const editingId = mode === 'edit' ? productId : undefined;
      let imageUrl = data.image || product?.image || '';

      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          const msg = uploadData.error || 'Ошибка загрузки изображения';
          throw new Error(msg);
        }
        imageUrl = uploadData.url;
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

      const url = editingId ? `/api/admin/products/${editingId}` : '/api/admin/products';
      const method = editingId ? 'PUT' : 'POST';
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
      queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
      router.push('/admin/products');
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Ошибка сохранения'),
  });

  const goBack = () => router.push('/admin/products');

  const title = mode === 'edit' ? 'Редактировать товар' : 'Новый товар';
  const saving = saveMutation.isPending;
  const canSave = Boolean(form.name && form.price && form.categoryId);
  if (mode === 'edit' && productId && productLoading) {
    return (
      <div className="mx-auto flex min-h-[32vh] w-full max-w-2xl items-center justify-center">
        <p className="text-sm font-medium text-(--lg-text-muted)">Загрузка…</p>
      </div>
    );
  }

  if (mode === 'edit' && productId && !productLoading && (productError || !product)) {
    return (
      <p className="text-center text-sm text-rose-600">Товар не найден</p>
    );
  }

  const fieldClass =
    'input-pill w-full !rounded-2xl border border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] py-3.5 !text-[0.9375rem] shadow-[inset_0_1px_0_color-mix(in_srgb,white_35%,transparent)]';
  const selectClass =
    'select-pill w-full !rounded-2xl border border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] py-3.5 !text-[0.9375rem] shadow-sm';

  return (
    <div className="mx-auto w-full max-w-2xl pb-12 sm:pb-16">
      <header className="mb-7 flex min-w-0 items-end justify-between gap-4 sm:mb-9">
        <div className="min-w-0">
          <p className="admin-form-eyebrow mb-1.5">Каталог</p>
          <h1 className="m-0 text-2xl font-semibold leading-tight tracking-tight text-(--lg-text) sm:text-[1.65rem]">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="btn-icon size-11"
            onClick={goBack}
            disabled={saving}
            aria-label="Отмена"
            title="Отмена"
          >
            <X className="size-5" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="btn-primary inline-flex! h-11! w-11! max-h-11! min-h-11! min-w-11! max-w-11! shrink-0! items-center! justify-center! gap-0! p-0! px-0! py-0! rounded-full!"
            onClick={() => {
              setError('');
              saveMutation.mutate(form);
            }}
            disabled={!canSave || saving}
            aria-label={mode === 'edit' ? 'Сохранить' : 'Создать'}
            title={mode === 'edit' ? 'Сохранить' : 'Создать'}
          >
            <Save className="size-5" strokeWidth={2.25} />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-5 sm:gap-6">
        {error && (
          <div className="auth-alert-error rounded-2xl border border-rose-200/80 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <section className="admin-form-section">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 pr-2">
              <p className="text-sm font-semibold text-(--lg-text)">Доступен для заказа</p>
              <p className="admin-form-hint mt-1">
                Пока выключено, блюдо не показывается в меню и в корзину не добавляется.
              </p>
            </div>
            <Switch
              id="product-is-available"
              checked={form.isAvailable}
              onChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))}
              disabled={saving}
              aria-label="Доступен для заказа"
            />
          </div>
        </section>

        <section className="admin-form-section">
          <p className="admin-form-eyebrow">Внешний вид</p>
          <p className="admin-form-hint mt-1.5 mb-4">
            Превью 2:3, как в карточке товара в меню. Формат JPG, PNG, WebP — до 5 МБ.
          </p>
          <AdminProductImageField
            previewUrl={currentImageUrl}
            onFileSelect={(file) => setImageFile(file)}
            onClear={clearProductImage}
            showHeading={false}
          />
        </section>

        <section className="admin-form-section space-y-5">
          <div>
            <p className="admin-form-eyebrow">Основное</p>
            <p className="admin-form-hint mt-1.5">Название и описание, как увидит гость.</p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-(--lg-text)">
              Название <span className="text-rose-500">*</span>
            </span>
            <input
              className={fieldClass}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-(--lg-text)">Описание</span>
            <textarea
              className="glass-tight min-h-22 w-full resize-none rounded-2xl border border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] px-4 py-3.5 text-[0.9375rem] text-(--lg-text) shadow-[inset_0_1px_0_color-mix(in_srgb,white_35%,transparent)] outline-none focus:border-(--lg-ring-strong) focus:ring-2 focus:ring-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
        </section>

        <section className="admin-form-section">
          <p className="admin-form-eyebrow">Цена и раздел</p>
          <p className="admin-form-hint mt-1.5 mb-5">Стоимость блюда и раздел витрины.</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-(--lg-text)">
                Цена (₽) <span className="text-rose-500">*</span>
              </span>
              <input
                className={fieldClass}
                type="number"
                inputMode="decimal"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-(--lg-text)">
                Категория <span className="text-rose-500">*</span>
              </span>
              <select
                className={selectClass}
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Выберите категорию</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="admin-form-section">
          <p className="admin-form-eyebrow">Пищевая ценность</p>
          <p className="admin-form-hint mt-1.5 mb-5">На порцию — опционально, для отображения в меню.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {(
              [
                ['calories', 'Ккал'],
                ['proteins', 'Белки, г'],
                ['fats', 'Жиры, г'],
                ['carbs', 'Углеводы, г'],
                ['fiber', 'Клетчатка, г'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-(--lg-text-muted)">{label}</span>
                <input
                  className={fieldClass + ' py-2.5 text-sm tabular-nums'}
                  type="number"
                  inputMode="decimal"
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="admin-form-section">
          <p className="admin-form-eyebrow">Состав</p>
          <p className="admin-form-hint mt-1.5 mb-4">Допы и варианты в карточке блюда.</p>
          <div className="max-h-52 space-y-0 overflow-y-auto rounded-xl border border-[color-mix(in_srgb,var(--lg-text)_6%,transparent)] bg-[color-mix(in_srgb,white_50%,var(--lg-fill))] p-1.5">
            {ingredients.map((ing) => (
              <label
                key={ing.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-(--lg-text) transition hover:bg-[color-mix(in_srgb,var(--lg-text)_4%,transparent)]"
              >
                <input
                  type="checkbox"
                  className="size-[1.05rem] shrink-0 rounded border-[color-mix(in_srgb,var(--lg-text)_15%,transparent)] accent-[#18181b]"
                  checked={form.ingredientIds.includes(ing.id)}
                  onChange={() => toggleIngredient(ing.id)}
                />
                <span className="min-w-0 flex-1 text-[0.9375rem] text-(--lg-text)">{ing.name}</span>
                <span className="shrink-0 tabular-nums text-sm text-(--lg-text-muted)">+{ing.price} ₽</span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
