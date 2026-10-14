'use client';
import {useEffect, useRef, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useAuthStore} from '@/store/authStore';
import {inventoryKinds, inventoryKindLabels, inventoryUnitLabels, type InventoryKind, type InventoryUnit} from '@/lib/inventoryStock';
import {parseRecipeDraft, recipeDraftInput, type RecipeDraft, type StoredRecipeDraft} from '@/lib/recipeDraft';
import {ArrowLeft, Check, Plus, Search, X, Trash2, ChefHat} from 'lucide-react';
import './recipe-editor.css';

type Item = {id:string; name:string; kind:InventoryKind; unit:InventoryUnit; stockKnown?:boolean; isActive?:boolean};
type Props = {ownerKind:'PRODUCT'|'PREPARED'; ownerId:string; outputUnit?:InventoryUnit; readOnly?:boolean; ancestors?:string[]; onSaved?:()=>void};
const read = async (url:string, init?:RequestInit) => {
  const response = await fetch(url, {cache:'no-store', ...init});
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? 'Не удалось выполнить запрос');
  return data;
};
export default function RecipeEditor({ownerKind, ownerId, outputUnit='pcs', readOnly=false, ancestors=[], onSaved}:Props) {
  const userId = useAuthStore(s=>s.user?.id);
  const qc = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<RecipeDraft>({outputQuantity:'1', outputUnit, instructions:'', lines:[]});
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false), [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]), [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false), [createBusy, setCreateBusy] = useState(false), [createError, setCreateError] = useState('');
  const [name, setName] = useState(''), [kind, setKind] = useState<InventoryKind>('RAW'), [unit, setUnit] = useState<InventoryUnit>('g');
  const [nested, setNested] = useState<Item|null>(null), [recovery, setRecovery] = useState<StoredRecipeDraft|null>(null);
  const [dirty, setDirty] = useState(false), [draftNotice, setDraftNotice] = useState(''), [reload, setReload] = useState(0);
  const draftRef = useRef(draft);
  useEffect(()=>{draftRef.current=draft},[draft]);
  const dirtyRef = useRef(dirty);
  useEffect(()=>{dirtyRef.current=dirty},[dirty]);
  const draftKey = userId ? `belok:recipe-draft:${userId}:${ownerKind}:${ownerId}` : null;
  const blocked = [...ancestors, ...(ownerKind === 'PREPARED' ? [ownerId] : [])];
  useEffect(()=>{
    let active = true;
    setLoaded(false);
    void Promise.all([read('/api/admin/inventory'), read(`/api/admin/inventory/recipes?ownerKind=${ownerKind}&ownerId=${encodeURIComponent(ownerId)}`)])
      .then(([i,r])=>{
        if (!active) return;
        setItems(i.items ?? []);
        setDraft({outputQuantity:String(r.recipe?.outputQuantity ?? 1), outputUnit:r.recipe?.outputUnit ?? outputUnit,
          instructions:r.recipe?.instructions ?? '', lines:(r.recipe?.lines ?? []).map((line:{itemId:string;quantity:number})=>({...line, quantity:String(line.quantity)}))});
        setDirty(false); setError(''); setInfo(''); setRecovery(null);
        if (draftKey && !readOnly) {
          try { setRecovery(parseRecipeDraft(localStorage.getItem(draftKey))); }
          catch { setDraftNotice('Не удалось открыть черновик в этом браузере.'); }
        }
        setLoaded(true);
      }).catch(e=>{if(active)setError(e instanceof Error ? e.message : 'Ошибка загрузки')});
    return ()=>{active=false};
  }, [ownerKind, ownerId, outputUnit, draftKey, readOnly, reload]);
  useEffect(()=>{
    if (!draftKey || readOnly || !loaded) return;
    const persist = () => {
      if (!dirtyRef.current) return;
      try {localStorage.setItem(draftKey, JSON.stringify({version:1, updatedAt:Date.now(), draft:draftRef.current}));}
      catch {setDraftNotice('Черновик не удалось сохранить. Сохраните техкарту перед выходом.');}
    };
    window.addEventListener('pagehide', persist);
    return ()=>{persist(); window.removeEventListener('pagehide', persist)};
  }, [draftKey, readOnly, loaded]);
  useEffect(()=>{
    if (!draftKey || readOnly || !loaded || !dirty) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({version:1, updatedAt:Date.now(), draft}));
      setDraftNotice('Черновик сохранён в этом браузере.');
    } catch {setDraftNotice('Черновик не удалось сохранить. Сохраните техкарту перед выходом.');}
  }, [draft, dirty, draftKey, loaded, readOnly]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!createBusy)setOpen(false)};
    document.addEventListener('keydown',escape);
    return ()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',escape)};
  },[open,createBusy]);
  function change(update:(old:RecipeDraft)=>RecipeDraft) {setDraft(update); setDirty(true); setInfo('');}
  function clearDraft() {
    dirtyRef.current=false; setDirty(false); setRecovery(null); setDraftNotice('');
    try {if(draftKey)localStorage.removeItem(draftKey)} catch {setDraftNotice('Не удалось удалить локальный черновик.');}
  }
  function commitSelection() {
    change(old=>({...old, lines:selected.map(itemId=>old.lines.find(x=>x.itemId===itemId) ?? {itemId, quantity:''})}));
    setOpen(false);
  }
  async function save() {
    setError(''); setInfo(''); setSaving(true);
    try {
      const input=recipeDraftInput(draft);
      await read('/api/admin/inventory/recipes', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ownerKind, ownerId, ...input})});
      clearDraft(); setInfo('Технологическая карта сохранена');
      void qc.invalidateQueries({queryKey:['admin-recipes']});
      void qc.invalidateQueries({queryKey:['admin-products-v2']});
      void qc.invalidateQueries({queryKey:['admin-inventory']});
      onSaved?.();
    } catch(e) {setError(e instanceof Error ? e.message : 'Ошибка сохранения')}
    finally {setSaving(false)}
  }
  async function create() {
    setCreateError(''); setCreateBusy(true);
    try {
      // Catalog creation never accepts stock quantities or creates stock movements.
      const {item}=await read('/api/admin/inventory', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:name.trim(), kind, unit})});
      setItems(old=>[...old, item].sort((a,b)=>a.name.localeCompare(b.name,'ru')));
      setSelected(old=>[...old, item.id]); setCreating(false); setSearch('');
      void qc.invalidateQueries({queryKey:['admin-inventory']});
    } catch(e) {setCreateError(e instanceof Error ? e.message : 'Ошибка создания')}
    finally {setCreateBusy(false)}
  }
  const available=items.filter(x=>x.isActive!==false && !blocked.includes(x.id));
  return <div className="recipe-workspace">
    <section className="recipe-panel" hidden={Boolean(nested)}>
      <header><h2>Состав и технологическая карта</h2><p>Количество в составе относится к рецептуре. Остатки внесёте отдельно при инвентаризации.</p></header>
      {!loaded ? <><p role={error?'alert':'status'}>{error || 'Загружаем состав…'}</p>{error&&<button type="button" className="btn-outline" onClick={()=>setReload(n=>n+1)}>Повторить</button>}</> : <>
        {recovery&&<div className="recipe-notice"><p>Есть несохранённый черновик от {new Date(recovery.updatedAt).toLocaleString('ru-RU')}. Восстановление заменит состав в редакторе; сохранённая техкарта изменится только после нажатия «Сохранить».</p><div className="recipe-actions"><button type="button" className="btn-outline" onClick={()=>{setDraft(recovery.draft);setRecovery(null);setDirty(true)}}>Восстановить</button><button type="button" className="btn-ghost" onClick={clearDraft}>Удалить черновик</button></div></div>}
        <div className="recipe-output"><label>Выход порции или партии<input disabled={readOnly||saving||Boolean(recovery)} inputMode="decimal" value={draft.outputQuantity} onChange={e=>change(d=>({...d,outputQuantity:e.target.value}))}/></label><label>Единица<select disabled={readOnly||saving||Boolean(recovery)||ownerKind==='PREPARED'} value={draft.outputUnit} onChange={e=>change(d=>({...d,outputUnit:e.target.value as InventoryUnit}))}>{Object.entries(inventoryUnitLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
        <p className="recipe-caption">Например: состав на 20 булочек, выход — 20 шт. В блюдо добавьте одну булочку.</p>
        <div className="recipe-lines">{draft.lines.map(line=>{
          const item=items.find(i=>i.id===line.itemId);
          return <article key={line.itemId} className="recipe-line"><div className="recipe-line-heading"><div><strong>{item?.name ?? 'Недоступный компонент'}</strong><small>{item ? inventoryKindLabels[item.kind] : 'Проверьте наличие в каталоге'}</small></div>{!readOnly&&<button type="button" disabled={saving||Boolean(recovery)} aria-label={`Убрать ${item?.name ?? 'компонент'}`} onClick={()=>change(d=>({...d,lines:d.lines.filter(x=>x.itemId!==line.itemId)}))}><Trash2 size={18}/></button>}</div>
            <label>Количество, {item ? inventoryUnitLabels[item.unit] : 'ед.'}<input disabled={readOnly||saving||Boolean(recovery)} inputMode="decimal" placeholder="Можно заполнить позже" value={line.quantity} onChange={e=>change(d=>({...d,lines:d.lines.map(x=>x.itemId===line.itemId ? {...x,quantity:e.target.value}:x)}))}/></label>
            {item?.kind==='PREPARED'&&<button type="button" className="btn-outline recipe-prepared" disabled={saving||blocked.includes(item.id)} onClick={()=>setNested(item)}><ChefHat size={16}/> Состав и приготовление</button>}
          </article>;
        })}</div>
        {!draft.lines.length&&<p className="recipe-empty">Добавьте сырьё, заготовки и упаковку. Новые наименования можно создать прямо здесь.</p>}
        {!readOnly&&<button type="button" className="btn-outline recipe-add" disabled={saving||Boolean(recovery)} onClick={()=>{setSelected(draft.lines.map(x=>x.itemId));setSearch('');setCreating(false);setCreateError('');setOpen(true)}}><Plus size={18}/> Добавить или выбрать компоненты</button>}
        <label className="recipe-process">Технологический процесс<textarea disabled={readOnly||saving||Boolean(recovery)} maxLength={15000} rows={6} value={draft.instructions} placeholder="Опишите подготовку, порядок приготовления, время, температуру и хранение…" onChange={e=>change(d=>({...d,instructions:e.target.value}))}/></label>
        {error&&<p role="alert" className="recipe-error">{error}</p>}{info&&<p role="status" className="recipe-success">{info}</p>}
        {!readOnly&&<footer><p className="recipe-caption" role="status">{draftNotice || 'Можно оставить незаполненные количества в черновике. Для сохранения техкарты заполните состав и выход.'}</p><button type="button" className="btn-primary" disabled={saving||Boolean(recovery)} onClick={()=>void save()}>{saving?'Сохранение…':'Сохранить техкарту'}</button></footer>}
      </>}
    </section>
    {nested&&<section className="recipe-nested"><button type="button" className="btn-outline recipe-back" onClick={()=>{setNested(null);void read('/api/admin/inventory').then(data=>setItems(data.items)).catch(e=>setError(e.message))}}><ArrowLeft size={18}/> Вернуться к составу</button><h2>{nested.name}</h2><RecipeEditor key={nested.id} ownerKind="PREPARED" ownerId={nested.id} outputUnit={nested.unit} readOnly={readOnly} ancestors={blocked}/></section>}
    {open&&<div className="recipe-overlay"><button type="button" aria-label="Закрыть выбор компонентов" className="recipe-backdrop" disabled={createBusy} onClick={()=>setOpen(false)}/><section role="dialog" aria-modal="true" aria-label="Компоненты рецептуры" className="recipe-picker"><header><h2>{creating?'Новое наименование':'Компоненты рецептуры'}</h2><button type="button" aria-label="Закрыть" disabled={createBusy} onClick={()=>setOpen(false)}><X/></button></header>
      {creating ? <div className="recipe-create"><p className="recipe-notice">Остаток не нужен. Фактическое наличие внесёте при инвентаризации.</p><label>Название<input autoFocus maxLength={160} value={name} disabled={createBusy} onChange={e=>setName(e.target.value)}/></label><div className="recipe-output"><label>Тип<select value={kind} disabled={createBusy} onChange={e=>setKind(e.target.value as InventoryKind)}>{inventoryKinds.map(k=><option key={k} value={k}>{inventoryKindLabels[k]}</option>)}</select></label><label>Единица<select value={unit} disabled={createBusy} onChange={e=>setUnit(e.target.value as InventoryUnit)}>{Object.entries(inventoryUnitLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
      {createError&&<p role="alert" className="recipe-error">{createError}</p>}<div className="recipe-actions"><button type="button" className="btn-outline" disabled={createBusy} onClick={()=>setCreating(false)}>К списку</button><button type="button" className="btn-primary" disabled={createBusy||!name.trim()} onClick={()=>void create()}>{createBusy?'Создаём…':'Создать и выбрать'}</button></div></div> : <>
        <div className="recipe-picker-tools"><label className="recipe-search"><Search size={18}/><input aria-label="Поиск компонентов" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Найти ингредиент или заготовку"/></label><button type="button" className="btn-outline" onClick={()=>{setName(search);setKind('RAW');setUnit('g');setCreating(true);setCreateError('')}}><Plus size={18}/> Создать компонент</button></div>
        <div className="recipe-options">{available.filter(x=>x.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).map(item=>{const checked=selected.includes(item.id);return <button type="button" key={item.id} className={`recipe-option ${checked?'selected':''}`} aria-pressed={checked} onClick={()=>setSelected(old=>checked?old.filter(id=>id!==item.id):[...old,item.id])}><span><strong>{item.name}</strong><small>{inventoryKindLabels[item.kind]} · {inventoryUnitLabels[item.unit]}</small></span>{checked&&<Check size={19}/>}</button>})}{!available.some(x=>x.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')))&&<p className="recipe-empty">Ничего не найдено. Создайте новое наименование.</p>}</div>
        <footer><span>Выбрано: {selected.length}</span><button type="button" className="btn-primary" disabled={selected.length>100} onClick={commitSelection}>Добавить в состав</button></footer>
      </>}
    </section></div>}
  </div>;
}
