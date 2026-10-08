'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Save, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminProductImageField from '@/components/admin/AdminProductImageField';
import SortableList from '@/components/admin/SortableList';
import Switch from '@/components/ui/Switch';
import { SpicinessBadge } from '@/components/product/SpicinessBadge';
import { VARIANT_NUMBER_FIELDS, type VariantValues } from '@/lib/productOptions';
import type { IngredientLinkWrite } from '@/lib/productIngredients';
import { SPICINESS_LEVELS } from '@/lib/productSpiciness';

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
  optionGroup?: string | null;
}

export interface AdminProductVariant extends VariantValues {
  id: string;
  name: string;
  image: string | null;
}

type VariantDraft = Record<(typeof VARIANT_NUMBER_FIELDS)[number], string> & {
  id: string;
  persisted: boolean;
  name: string;
  image: string;
  file: File | null;
  preview: string | null;
};

function newVariantDraft(): VariantDraft {
  return {
    price: '', calories: '', proteins: '', fats: '', carbs: '', fiber: '', weightGrams: '', volumeMl: '',
    id: crypto.randomUUID(),
    persisted: false,
    name: '',
    image: '',
    file: null,
    preview: null,
  };
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
  weightGrams: number | null;
  spicinessLevel: number;
  sortOrder: number;
  category: { id: string; name: string };
  ingredients: ProductIngredient[];
  variants?: AdminProductVariant[];
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
  weightGrams: '',
  spicinessLevel: 0,
  sortOrder: 0,
  ingredientLinks: [] as IngredientLinkWrite[],
  variants: [] as VariantDraft[],
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
  const [loadedProductId, setLoadedProductId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const variantsRef = useRef(form.variants);
  useLayoutEffect(() => { variantsRef.current = form.variants; }, [form.variants]);

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

  if (mode === 'edit' && product && loadedProductId !== product.id) {
    setLoadedProductId(product.id);
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
      weightGrams: product.weightGrams?.toString() || '',
      spicinessLevel: product.spicinessLevel ?? 0,
      sortOrder: product.sortOrder,
      ingredientLinks: product.ingredients.map((pi) => ({ ingredientId: pi.ingredientId, isDefault: pi.isDefault, isRemovable: pi.isRemovable, isExtra: pi.isExtra, optionGroup: pi.optionGroup ?? null })),
      variants: (product.variants ?? []).map((variant) => ({
        ...Object.fromEntries(VARIANT_NUMBER_FIELDS.map((field) => [field, variant[field]?.toString() ?? ''])) as Record<(typeof VARIANT_NUMBER_FIELDS)[number], string>,
        id: variant.id,
        persisted: true,
        name: variant.name,
        image: variant.image || '',
        file: null,
        preview: null,
      })),
    });
    setImageFile(null);
    setFilePreviewUrl(null);
  }

  useEffect(() => {
    return () => {
      for (const variant of variantsRef.current) {
        if (variant.preview) URL.revokeObjectURL(variant.preview);
      }
    };
  }, []);

  useEffect(() => () => { if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl); }, [filePreviewUrl]);

  const setProductFile = (file: File) => {
    setImageFile(file);
    setFilePreviewUrl(URL.createObjectURL(file));
  };

  const currentImageUrl = filePreviewUrl || form.image || null;

  const clearProductImage = () => {
    setImageFile(null);
    setFilePreviewUrl(null);
    setForm((f) => ({ ...f, image: '' }));
  };

  const toggleIngredient = (id: string) => {
    setForm((current) => ({ ...current, ingredientLinks: current.ingredientLinks.some((link) => link.ingredientId === id)
      ? current.ingredientLinks.filter((link) => link.ingredientId !== id)
      : [...current.ingredientLinks, { ingredientId: id, isDefault: true, isRemovable: true, isExtra: false, optionGroup: null }] }));
  };
  const updateIngredient = (id: string, patch: Partial<IngredientLinkWrite>) => setForm((current) => ({ ...current,
    ingredientLinks: current.ingredientLinks.map((link) => link.ingredientId === id ? { ...link, ...patch } : link) }));

  const saveMutation = useMutation({
    mutationFn: async (data: FormState & { image?: string }) => {
      const editingId = mode === 'edit' ? productId : undefined;
      let imageUrl = data.image || '';

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

      const variants = await Promise.all(
        data.variants.map(async (variant) => {
          let image = variant.image || '';
          if (variant.file) {
            const fd = new FormData();
            fd.append('file', variant.file);
            const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) {
              throw new Error(uploadData.error || 'Ошибка загрузки изображения');
            }
            image = uploadData.url;
          }
          return {
            id: variant.persisted ? variant.id : undefined,
            ...Object.fromEntries(VARIANT_NUMBER_FIELDS.map((field) => [field, variant[field] === '' ? null : Number(variant[field])])),
            name: variant.name.trim(),
            image: image || null,
          };
        })
      );

      const body = {
        name: data.name,
        description: data.description,
        price: data.price,
        image: imageUrl,
        categoryId: data.categoryId,
        isAvailable: data.isAvailable,
        calories: data.calories,
        proteins: data.proteins,
        fats: data.fats,
        carbs: data.carbs,
        fiber: data.fiber,
        weightGrams: data.weightGrams,
        spicinessLevel: data.spicinessLevel,
        sortOrder: data.sortOrder,
        ingredients: data.ingredientLinks,
        variants,
      };

      const url = editingId ? `/api/admin/products/${editingId}` : '/api/admin/products';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Не удалось сохранить');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
      router.push('/admin/products');
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Ошибка сохранения'),
  });

  const goBack = () => router.push('/admin/products');

  const title = mode === 'edit' ? 'Редактировать товар' : 'Новый товар';
  const saving = saveMutation.isPending;
  const canSave = Boolean(
    form.name &&
      form.price &&
      form.categoryId &&
      form.variants.every((variant) => variant.name.trim() && VARIANT_NUMBER_FIELDS.every((field) => variant[field] === '' || (Number.isFinite(Number(variant[field])) && Number(variant[field]) >= 0)))
  );

  function updateVariant(id: string, patch: Partial<VariantDraft>) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)),
    }));
  }

  function removeVariant(id: string) {
    setForm((current) => {
      const target = current.variants.find((variant) => variant.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return { ...current, variants: current.variants.filter((variant) => variant.id !== id) };
    });
  }

  function setVariantFile(id: string, file: File) {
    if (!file.type.startsWith('image/')) return;
    const preview = URL.createObjectURL(file);
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant) => {
        if (variant.id !== id) return variant;
        if (variant.preview) URL.revokeObjectURL(variant.preview);
        return { ...variant, file, preview };
      }),
    }));
  }
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

  const submitLabel = mode === 'edit' ? 'Сохранить' : 'Создать';
  const handleSubmit = () => {
    setError('');
    saveMutation.mutate(form);
  };

  return (
    <>
      <header className="admin-form-toolbar -mx-2 -mt-(--admin-main-toolbar-shift) mb-6 px-3 pt-4 pb-3 sm:mb-7 sm:px-4 md:-ml-[calc(260px+1rem)] md:-mr-8 md:px-6">
        <div className="mx-auto flex w-full max-w-2xl min-w-0 items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-form-eyebrow mb-1.5">Каталог</p>
            <h1 className="m-0 text-xl font-semibold leading-tight tracking-tight text-(--lg-text) sm:text-2xl">
              {title}
            </h1>
          </div>
          <div className="hidden shrink-0 items-center gap-2 md:flex">
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
              onClick={handleSubmit}
              disabled={!canSave || saving}
              aria-label={submitLabel}
              title={submitLabel}
            >
              <Save className="size-5" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-4">
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
              Фото товара, пока у него нет вариантов. У каждого варианта своё фото. Формат JPG, PNG, WebP — до 5 МБ.
            </p>
            <AdminProductImageField
              previewUrl={currentImageUrl}
              onFileSelect={setProductFile}
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

          <fieldset className="admin-form-section min-w-0" disabled={saving}>
            <legend className="sr-only">Острота</legend>
            <p className="admin-form-eyebrow" aria-hidden="true">Острота</p>
            <p className="admin-form-hint mt-1.5 mb-4">
              Выберите от 1 до 3 перчиков. Если блюдо не острое, перчики на карточке не показываются.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SPICINESS_LEVELS.map(({ value, label }) => (
                <label key={value} className="relative block cursor-pointer">
                  <input
                    type="radio"
                    name="spicinessLevel"
                    value={value}
                    checked={form.spicinessLevel === value}
                    onChange={() => setForm((current) => ({ ...current, spicinessLevel: value }))}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-(--lg-ring) px-2 py-3 text-sm font-medium text-(--lg-text) transition peer-checked:border-rose-500 peer-checked:bg-rose-500/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rose-500 peer-disabled:opacity-50">
                    {value > 0 ? <SpicinessBadge level={value} /> : null}
                    <span>{label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <section className="admin-form-section">
            <p className="admin-form-eyebrow">Варианты</p>
            <p className="admin-form-hint mt-1.5 mb-4">
              Версия блюда или размер напитка. Варианты листаются в одной карточке меню и киоска.
              Пустые цена и КБЖУ используют значения основного товара. Объём укажите в миллилитрах.
            </p>
            {form.variants.length > 0 ? (
              <SortableList
                items={form.variants}
                disabled={saving}
                onReorder={(variants) => setForm((current) => ({ ...current, variants }))}
                renderItem={(variant) => {
                  const preview = variant.preview || variant.image || null;
                  return (
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] bg-[color-mix(in_srgb,white_55%,var(--lg-fill))] p-2">
                      <label className="relative flex size-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-white">
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={preview} alt="" className="size-full object-contain p-1" />
                        ) : (
                          <ImagePlus className="size-5 text-(--lg-text-muted)" />
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="sr-only"
                          disabled={saving}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) setVariantFile(variant.id, file);
                            event.target.value = '';
                          }}
                        />
                      </label>
                      <input
                        className={fieldClass}
                        aria-label="Название варианта"
                        placeholder="Название, например Большой"
                        value={variant.name}
                        disabled={saving}
                        onChange={(event) => updateVariant(variant.id, { name: event.target.value })}
                      />
                      <button
                        type="button"
                        className="btn-icon size-11 shrink-0"
                        aria-label="Удалить вариант"
                        disabled={saving}
                        onClick={() => removeVariant(variant.id)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                        {([['price', 'Цена, ₽'], ['volumeMl', 'Объём, мл'], ['weightGrams', 'Вес, г'], ['calories', 'Ккал'], ['proteins', 'Белки, г'], ['fats', 'Жиры, г'], ['carbs', 'Углеводы, г'], ['fiber', 'Клетчатка, г']] as const).map(([field, label]) => (
                          <label key={field} className="flex min-w-0 flex-col gap-1 text-xs text-(--lg-text-muted)">
                            {label}
                            <input type="number" min="0" step={field === 'price' ? '0.01' : 'any'} className={fieldClass} aria-label={`${label} варианта ${variant.name}`} value={variant[field]} placeholder={field === 'volumeMl' ? 'Не указан' : 'Как у товара'} disabled={saving} onChange={(event) => updateVariant(variant.id, { [field]: event.target.value })} />
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
            ) : (
              <p className="text-sm text-(--lg-text-muted)">Вариантов нет — в меню это один товар.</p>
            )}
            <button
              type="button"
              className="btn-outline mt-4 h-11 text-sm"
              disabled={saving}
              onClick={() =>
                setForm((current) => ({ ...current, variants: [...current.variants, newVariantDraft()] }))
              }
            >
              <Plus className="size-4" />
              Добавить вариант
            </button>
          </section>

          <section className="admin-form-section">
            <p className="admin-form-eyebrow">Пищевая ценность</p>
            <p className="admin-form-hint mt-1.5 mb-5">На порцию — опционально, для отображения в меню.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
              {(
                [
                  ['weightGrams', 'Вес, г'],
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
            <p className="admin-form-eyebrow">Состав и добавки</p>
            <p className="admin-form-hint mt-1.5 mb-4">Укажите состав и платные добавки. Одинаковая группа, например «Молоко» или «Сироп», объединяет варианты в выбор одного. Для замены молока включите в группу обычное молоко как заменяемый состав, а альтернативы — как добавки.</p>
            <div className="space-y-3">
              {ingredients.map((ing) => {
                const link = form.ingredientLinks.find((entry) => entry.ingredientId === ing.id);
                return (
                  <div key={ing.id} className="rounded-xl border border-(--lg-ring) p-3">
                    <label className="flex min-h-10 items-center gap-3">
                      <input type="checkbox" className="size-5 accent-emerald-600" checked={Boolean(link)} disabled={saving} onChange={() => toggleIngredient(ing.id)} />
                      <span className="flex-1 font-medium">{ing.name}</span><span className="text-sm">+{ing.price} ₽</span>
                    </label>
                    {link ? <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={link.isDefault ?? false} disabled={saving} onChange={(event) => updateIngredient(ing.id, { isDefault: event.target.checked })} />В составе</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={link.isRemovable ?? false} disabled={saving} onChange={(event) => updateIngredient(ing.id, { isRemovable: event.target.checked })} />Можно убрать</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={link.isExtra ?? false} disabled={saving} onChange={(event) => updateIngredient(ing.id, { isExtra: event.target.checked })} />Можно добавить</label>
                      <label className="flex w-full flex-col gap-1">Группа выбора
                        <input className={fieldClass} aria-label={`Группа выбора ${ing.name}`} value={link.optionGroup ?? ''} maxLength={80} placeholder="Без группы — независимая добавка" disabled={saving} onChange={(event) => updateIngredient(ing.id, { optionGroup: event.target.value })} />
                      </label>
                    </div> : null}
                  </div>
                );
              })}
              {ingredients.length === 0 ? <p className="text-sm text-(--lg-text-muted)">Сначала добавьте ингредиенты в разделе «Ингредиенты».</p> : null}
            </div>
          </section>
        </div>
      </div>

      <div className="admin-form-action-bar fixed inset-x-0 bottom-0 z-30 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
          <button
            type="button"
            className="btn-outline flex-1 h-12 text-sm"
            onClick={goBack}
            disabled={saving}
          >
            <X className="size-4" strokeWidth={2.25} />
            Отмена
          </button>
          <button
            type="button"
            className="btn-primary flex-1 h-12 text-sm"
            onClick={handleSubmit}
            disabled={!canSave || saving}
          >
            <Save className="size-4" strokeWidth={2.25} />
            {submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}
