'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Trash2 } from 'lucide-react';
import { kitchenCardSchema, kitchenRequest, type KitchenCard, type KitchenStep } from '@/lib/kitchen';

const inputClass = 'mt-1 w-full rounded-xl border border-(--lg-ring) bg-(--lg-fill) px-3 py-2.5 text-sm text-(--lg-text) outline-none focus:border-(--lg-ring-strong)';
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>;
}

export default function AdminKitchenPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<KitchenCard | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { data, isPending, error: loadError, refetch } = useQuery({
    queryKey: ['admin-kitchen-cards'],
    queryFn: () => kitchenRequest<{ cards: KitchenCard[] }>('/api/admin/kitchen'),
  });
  const cards = data?.cards ?? [];

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function open(card: KitchenCard) {
    if (dirty && !window.confirm('Есть несохранённые изменения. Открыть другую карту и отменить изменения?')) return;
    setDraft(structuredClone(card)); setDirty(false); setError(''); setSaved(false);
  }
  function edit(patch: Partial<KitchenCard>) {
    setDraft(current => current ? { ...current, ...patch } : current);
    setDirty(true); setSaved(false); setError('');
  }
  function updateStep(id: string, patch: Partial<KitchenStep>) {
    setDraft(current => current ? { ...current, steps: current.steps.map(s => s.id === id ? { ...s, ...patch } : s) } : current);
    setDirty(true); setSaved(false); setError('');
  }
  function move(index: number, direction: number) {
    if (!draft) return;
    const steps = [...draft.steps];
    [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]];
    edit({ steps });
  }
  async function upload(id: string, file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Выберите JPEG, PNG, WebP или GIF размером до 5 МБ'); return;
    }
    setUploading(true); setError('');
    try {
      const body = new FormData(); body.set('file', file); body.set('folder', 'content');
      const result = await kitchenRequest<{ url: string }>('/api/upload', { method: 'POST', body });
      updateStep(id, { imageUrl: result.url });
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  }
  async function save() {
    const result = kitchenCardSchema.safeParse(draft);
    if (!result.success) { setError(result.error.issues[0]?.message || 'Проверьте поля'); return; }
    setSaving(true); setError('');
    try {
      const response = await kitchenRequest<{ card: KitchenCard }>(`/api/admin/kitchen/${result.data.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result.data),
      });
      queryClient.setQueryData<{ cards: KitchenCard[] }>(['admin-kitchen-cards'], current => ({
        cards: [...(current?.cards ?? []).filter(c => c.id !== response.card.id), response.card].sort((a,b) => a.title.localeCompare(b.title, 'ru')),
      }));
      void queryClient.invalidateQueries({ queryKey: ['kitchen-cards'] });
      setDraft(response.card); setDirty(false); setSaved(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  if (isPending) return <p className="p-4">Загружаем техкарты…</p>;
  if (loadError) return <div className="p-4"><p role="alert">{loadError.message}</p><button className="btn-ghost mt-3" onClick={() => void refetch()}>Повторить</button></div>;

  return <div className="mx-auto max-w-6xl pb-8">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="heading-section">Кухня · техкарты</h1><p className="mt-2 text-sm text-(--lg-text-muted)">Состав, порядок действий, фотографии и таймеры для обучения персонала.</p></div>
      <Link href="/kitchen" className="btn-ghost gap-2 px-4 py-2.5"><ExternalLink size={16} /> Открыть кухню</Link>
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="glass-panel p-3 lg:sticky lg:top-0">
        <input className={inputClass} aria-label="Поиск карт в админке" placeholder="Найти карту…" value={search} onChange={e => setSearch(e.target.value)} />
        <p className="my-3 text-xs text-(--lg-text-muted)">{cards.length} карт · {cards.filter(c => !c.published).length} черновиков</p>
        <button disabled={saving || uploading} className="btn-ghost mb-3 w-full gap-2 py-2.5" onClick={() => open({
          id: crypto.randomUUID(), title: 'Новая техкарта', sourceNumber: '', sourceText: '', category: 'Блюда',
          yieldText: '', notes: '', published: false, version: 0, ingredients: [], steps: [],
        })}><Plus size={16} /> Новая карта</button>
        <div className="max-h-[350px] space-y-1 overflow-y-auto lg:max-h-[65dvh]">
          {cards.filter(c => `${c.title} ${c.sourceNumber}`.toLowerCase().includes(search.toLowerCase())).map(c => <button key={c.id} disabled={saving || uploading}
            className={`w-full rounded-xl border p-3 text-left text-sm ${draft?.id === c.id ? 'border-(--lg-ring-strong) bg-(--lg-fill-active)' : 'border-transparent hover:bg-(--lg-fill)'}`}
            onClick={() => open(c)}>
            <span className="block font-semibold">{c.title}</span><span className="mt-1 block text-xs text-(--lg-text-muted)">№ {c.sourceNumber || '—'} · {c.published ? 'Опубликована' : 'Черновик'}</span>
          </button>)}
        </div>
      </aside>
      {!draft ? <div className="glass-panel p-8 text-(--lg-text-muted)">Выберите техкарту слева, чтобы изменить процесс приготовления.</div> : <div>
        <div className="glass-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-sm">{dirty ? 'Есть несохранённые изменения' : `Версия ${draft.version || 'новая'}`}</span>
          <button className="btn-primary gap-2 px-5 py-3 disabled:opacity-50" disabled={saving || uploading || !dirty} onClick={() => void save()}><Save size={16} />{saving ? 'Сохраняем…' : uploading ? 'Загружаем фото…' : 'Сохранить карту'}</button>
        </div>
        {error && <p role="alert" className="auth-alert-error mb-4">{error}</p>}
        {saved && <p role="status" className="mb-4 rounded-xl bg-emerald-100 p-3 text-sm text-emerald-900">Карта сохранена{draft.published ? ' и доступна на кухне' : ' как черновик'}.</p>}
        <fieldset disabled={saving || uploading} className="space-y-4 disabled:opacity-70">
          <section className="glass-panel space-y-4 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">О блюде</h2>
            <Field label="Название"><input className={inputClass} maxLength={200} value={draft.title} onChange={e => edit({ title: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Категория"><input className={inputClass} maxLength={80} value={draft.category} onChange={e => edit({ category: e.target.value })} /></Field>
              <Field label="Выход продукта / порция"><input className={inputClass} maxLength={1000} value={draft.yieldText} onChange={e => edit({ yieldText: e.target.value })} /></Field>
            </div>
            <Field label="Примечания и условия"><textarea className={inputClass} rows={3} maxLength={5000} value={draft.notes} onChange={e => edit({ notes: e.target.value })} /></Field>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.published} onChange={e => edit({ published: e.target.checked })} className="size-5" /> Опубликовать для персонала</label>
            <p className="text-xs text-(--lg-text-muted)">Черновики доступны только в админке. Перед публикацией заполните недостающие данные и проверьте процесс.</p>
          </section>
          <section className="glass-panel space-y-3 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Состав</h2><p className="text-xs text-(--lg-text-muted)">Масса в граммах; для других единиц укажите «шт», «мл» и т. п. Варианты и дополнения подпишите явно.</p>
            {draft.ingredients.map((item, i) => <div key={i} className="rounded-xl border border-(--lg-ring) p-3">
              <div className="mb-2 flex items-end gap-2"><div className="flex-1"><Field label={`Ингредиент ${i+1}`}><input className={inputClass} maxLength={300} value={item.name} onChange={e => edit({ ingredients: draft.ingredients.map((v,k) => k === i ? { ...v, name: e.target.value } : v) })} /></Field></div>
                <button className="btn-icon size-10" aria-label={`Удалить ингредиент ${i+1}`} onClick={() => edit({ ingredients: draft.ingredients.filter((_,k) => k !== i) })}><Trash2 size={16} /></button></div>
              <div className="grid grid-cols-3 gap-2">{(['gross','net','output'] as const).map((key,k) => <Field key={key} label={['Брутто','Нетто','Готовый'][k]}><input className={inputClass} maxLength={100} value={item[key]} onChange={e => edit({ ingredients: draft.ingredients.map((v,j) => j === i ? { ...v, [key]: e.target.value } : v) })} /></Field>)}</div>
            </div>)}
            <button className="btn-ghost gap-2 py-2.5" disabled={draft.ingredients.length >= 100} onClick={() => edit({ ingredients: [...draft.ingredients, { name:'', gross:'', net:'', output:'' }] })}><Plus size={16} /> Добавить ингредиент</button>
          </section>
          <section className="space-y-3">
            <h2 className="px-1 text-lg font-semibold">Процесс · {draft.steps.length} шагов</h2>
            {draft.steps.map((step, i) => <div key={step.id} className="glass-panel space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">Шаг {i+1}</span><div className="flex gap-1">
                <button className="btn-icon size-9 disabled:opacity-30" aria-label={`Переместить шаг ${i+1} выше`} disabled={i === 0} onClick={() => move(i,-1)}><ArrowUp size={16} /></button>
                <button className="btn-icon size-9 disabled:opacity-30" aria-label={`Переместить шаг ${i+1} ниже`} disabled={i === draft.steps.length-1} onClick={() => move(i,1)}><ArrowDown size={16} /></button>
                <button className="btn-icon size-9" aria-label={`Удалить шаг ${i+1}`} onClick={() => edit({ steps: draft.steps.filter(s => s.id !== step.id) })}><Trash2 size={16} /></button>
              </div></div>
              <Field label="Заголовок шага"><input className={inputClass} maxLength={200} value={step.title} onChange={e => updateStep(step.id,{title:e.target.value})} /></Field>
              <Field label="Что сделать"><textarea className={inputClass} rows={4} maxLength={5000} value={step.text} onChange={e => updateStep(step.id,{text:e.target.value})} /></Field>
              <Field label="Таймер, секунды (0 — без таймера)"><input type="number" min={0} max={86400} className={inputClass} value={step.timerSeconds} onChange={e => updateStep(step.id,{timerSeconds:Number(e.target.value)})} /></Field>
              <Field label="Фото шага · до 5 МБ"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className={`${inputClass} cursor-pointer`} onChange={e => { void upload(step.id,e.target.files?.[0]); e.target.value=''; }} /></Field>
              {step.imageUrl && <div className="flex flex-wrap items-start gap-3">
                {/* Uploaded photos can be local files or externally stored images. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.imageUrl} alt={`Фото шага ${i+1}`} className="max-h-48 max-w-full rounded-xl object-contain" />
                <button className="btn-ghost gap-2 px-3 py-2" onClick={() => updateStep(step.id,{imageUrl:''})}><Trash2 size={16} /> Убрать фото</button>
              </div>}
            </div>)}
            <button className="btn-ghost w-full gap-2 py-3" disabled={draft.steps.length >= 100} onClick={() => edit({ steps:[...draft.steps,{id:crypto.randomUUID(),title:'Новый шаг',text:'',imageUrl:'',timerSeconds:0}] })}><Plus size={16} /> Добавить шаг</button>
          </section>
          {draft.sourceText && <details className="glass-panel p-4"><summary className="cursor-pointer text-sm font-semibold">Исходная инструкция из DOCX · карта № {draft.sourceNumber}</summary><p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-(--lg-text-muted)">{draft.sourceText}</p></details>}
          <button className="btn-primary w-full gap-2 py-3 disabled:opacity-50" disabled={saving || uploading || !dirty} onClick={() => void save()}><Save size={16} /> Сохранить карту</button>
        </fieldset>
      </div>}
    </div>
  </div>;
}
