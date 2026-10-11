'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Search, Save, Plus, Pencil, Trash2, ImagePlus, X, Boxes, AlertTriangle, History, ShieldCheck } from 'lucide-react';
import RecipeEditor from '@/components/admin/RecipeEditor';
import AdminSelect from '@/components/admin/AdminSelect';
import InventoryAdministration from '@/components/admin/InventoryAdministration';
import './inventory.css';

type Item={ id:string;name:string;kind:'RAW'|'PREPARED'|'PACKAGING';unit:'g'|'ml'|'pcs';quantity:string;minQuantity:string;notes:string;image?:string|null;updatedAt?:string };
const unitLabels={g:'г',ml:'мл',pcs:'шт.'};
const kindLabels={RAW:'Сырьё',PREPARED:'Полуфабрикат',PACKAGING:'Упаковка'};
type StockStatus='green'|'yellow'|'orange'|'red';
const statusLabels:Record<StockStatus,string>={green:'Достаточно',yellow:'Внимание',orange:'Скоро пополнить',red:'Пополнить'};
function stockStatus(item:Item):StockStatus {
 const qty=Number(item.quantity),min=Number(item.minQuantity);
 if(qty<=min)return 'red';
 // Without a replenishment threshold we cannot calculate relative stock levels.
 if(min<=0)return 'green';
 const ratio=qty/min;
 if(ratio<=1.25)return 'orange';
 if(ratio<=2)return 'yellow';
 return 'green';
}

async function api(method:'GET'|'POST'|'PATCH'|'PUT', body?:unknown):Promise<{items?:Item[];error?:string}> {
  const res=await fetch('/api/admin/inventory',{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await res.json();
  if(!res.ok) throw new Error(data.error||'Не удалось сохранить');
  return data;
}
export default function InventoryPage(){
  const qc=useQueryClient();
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState<'ALL'|Item['kind']>('ALL');
  const [statusFilter,setStatusFilter]=useState<'ALL'|StockStatus>('ALL');
  const [recipeItem,setRecipeItem]=useState<Item|null>(null);
  const [batchItem,setBatchItem]=useState<Item|null>(null);
  const [batchAmount,setBatchAmount]=useState('1');
  const [batchBusy,setBatchBusy]=useState(false);
  const [batchMessage,setBatchMessage]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState<Item|null>(null);
  const [image,setImage]=useState('');
  const [uploading,setUploading]=useState(false);
  const [name,setName]=useState('');
  const [kind,setKind]=useState<Item['kind']>('RAW');
  const [unit,setUnit]=useState<Item['unit']>('g');
  const [quantity,setQuantity]=useState('0');
  const [minQuantity,setMinQuantity]=useState('0');
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [error,setError]=useState('');
  const [deleteTarget,setDeleteTarget]=useState<Item|null>(null);
  const [administration,setAdministration]=useState<{itemId?:string;itemName?:string}|null>(null);
  const {data,isLoading,isError}=useQuery({queryKey:['admin-inventory'],queryFn:()=>api('GET')});
  const items=data?.items||[];
  const counts=useMemo(()=>({ALL:items.length,RAW:items.filter(i=>i.kind==='RAW').length,PREPARED:items.filter(i=>i.kind==='PREPARED').length,PACKAGING:items.filter(i=>i.kind==='PACKAGING').length}),[items]);
  const lowCount=items.filter(x=>stockStatus(x)==='red').length;
  const statusCounts=useMemo(()=>({ALL:items.length,green:items.filter(x=>stockStatus(x)==='green').length,yellow:items.filter(x=>stockStatus(x)==='yellow').length,orange:items.filter(x=>stockStatus(x)==='orange').length,red:items.filter(x=>stockStatus(x)==='red').length}),[items]);
  const filters=[{value:'ALL',label:'Все'},{value:'RAW',label:'Сырьё'},{value:'PREPARED',label:'Полуфабрикаты'},{value:'PACKAGING',label:'Упаковка'}] as const;
  const filtered=useMemo(()=>items.filter(x=>(filter==='ALL'||x.kind===filter)&&(statusFilter==='ALL'||stockStatus(x)===statusFilter)&&x.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))),[items,search,filter,statusFilter]);
  const resetForm=()=>{setShowForm(false);setEditing(null);setName('');setKind('RAW');setUnit('g');setQuantity('0');setMinQuantity('0');setImage('');setError('')};
  const openCreate=()=>{resetForm();setShowForm(true)};
  const openEdit=(item:Item)=>{setEditing(item);setName(item.name);setKind(item.kind);setUnit(item.unit);setQuantity(item.quantity);setMinQuantity(item.minQuantity);setImage(item.image??'');setShowForm(true);setError('');window.scrollTo({top:0,behavior:'smooth'})};
  const uploadImage=async (file:File)=>{setUploading(true);setError('');try{const data=new FormData();data.append('file',file);data.append('folder','products');const res=await fetch('/api/upload',{method:'POST',body:data});const result=await res.json();if(!res.ok)throw Error(result.error??'Ошибка загрузки');setImage(result.url)}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки')}finally{setUploading(false)}};
  const save=useMutation({mutationFn:(payload:unknown)=>api(editing?'PUT':'POST',payload),onSuccess:()=>{void qc.invalidateQueries({queryKey:['admin-inventory']});resetForm()},onError:(e:Error)=>setError(e.message)});
  const remove=useMutation({mutationFn:async(id:string)=>{const r=await fetch('/api/admin/inventory?id='+encodeURIComponent(id),{method:'DELETE'});const data=await r.json();if(!r.ok)throw Error(data.error??'Ошибка удаления');return data},onSuccess:()=>{setDeleteTarget(null);void qc.invalidateQueries({queryKey:['admin-inventory']})},onError:(e:Error)=>setError(e.message)});
  const recount=useMutation({mutationFn:(payload:unknown)=>api('PATCH',payload),onSuccess:()=>{void qc.invalidateQueries({queryKey:['admin-inventory']});setDrafts({});setError('');},onError:(e:Error)=>setError(e.message)});
  const valid=(s:string)=>s.trim()!=='' && Number.isFinite(Number(s)) && Number(s)>=0 && Math.round(Number(s)*1000)===Number(s)*1000;
  return <div className="space-y-5">
    <header className="flex items-center justify-between gap-3">
      <h1 className="heading-section m-0">Склад</h1>
      <div className="hidden sm:flex items-center gap-2">
        <button type="button" className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-sm" onClick={()=>setAdministration({})}><ShieldCheck size={17}/> История и доступы</button>
        <button type="button" className="btn-primary inline-flex items-center gap-2 px-4 py-2" onClick={openCreate}><Plus size={17}/>Добавить позицию</button>
      </div>
      <div className="flex sm:hidden items-center gap-2">
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#dce4df] bg-white" aria-label="История и доступы" onClick={()=>setAdministration({})}><ShieldCheck size={19}/></button>
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#242528] text-white" aria-label="Добавить позицию" onClick={openCreate}><Plus size={21}/></button>
      </div>
    </header>
    <label className="inventory-search inventory-search-mobile flex md:hidden w-full min-h-11 items-center gap-2 rounded-2xl border border-[#dce4df] bg-white px-3 text-[#52625c]">
      <Search size={18} aria-hidden="true"/>
      <input aria-label="Поиск по складу" className="min-w-0 flex-1 bg-transparent outline-none text-sm text-[#202b28]" placeholder="Поиск по складу" value={search} onChange={e=>setSearch(e.target.value)}/>
      {search&&<button type="button" aria-label="Очистить поиск" onClick={()=>setSearch('')}><X size={16}/></button>}
    </label>
    {administration&&<InventoryAdministration itemId={administration.itemId} itemName={administration.itemName} onClose={()=>setAdministration(null)}/>}
    {recipeItem&&<div className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">Рецептура: {recipeItem.name}</h2><button className="btn-outline px-3 py-2" onClick={()=>setRecipeItem(null)}>Закрыть</button></div><RecipeEditor key={recipeItem.id} ownerKind="PREPARED" ownerId={recipeItem.id} outputUnit={recipeItem.unit}/></div>}
    {batchItem&&<form className="glass-panel p-4 space-y-3" onSubmit={async e=>{e.preventDefault();setBatchBusy(true);setBatchMessage('');try{const r=await fetch('/api/admin/inventory/batches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preparedItemId:batchItem.id,quantity:Number(batchAmount)})});const data=await r.json();if(!r.ok)throw Error(data.error??'Ошибка');setBatchMessage('Партия выпущена, остатки обновлены');void qc.invalidateQueries({queryKey:['admin-inventory']});setBatchItem(null)}catch(err){setBatchMessage(err instanceof Error?err.message:'Ошибка')}finally{setBatchBusy(false)}}}><div className="flex justify-between"><h2 className="font-semibold">Выпуск: {batchItem.name}</h2><button type="button" className="btn-ghost" onClick={()=>setBatchItem(null)}>Закрыть</button></div><label className="block text-sm">Объём, {unitLabels[batchItem.unit]}<input className="inventory-field mt-1 w-full" type="number" min=".001" step=".001" value={batchAmount} onChange={e=>setBatchAmount(e.target.value)}/></label><button type="submit" className="btn-primary px-5 py-2" disabled={batchBusy||!valid(batchAmount)||Number(batchAmount)===0}>Подтвердить выпуск и списать компоненты</button></form>}
    {batchMessage&&<p role="status" className="text-sm">{batchMessage}</p>}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 sm:max-w-2xl">
      <div className="min-h-16 sm:min-h-32 rounded-2xl border border-[#174d38] bg-[#174d38] text-white px-4 py-3 sm:p-5 flex flex-row sm:flex-col items-center sm:items-stretch justify-between shadow-sm">
        <div className="flex flex-row-reverse sm:flex-row items-center sm:items-start justify-end sm:justify-between gap-3"><span className="text-sm font-medium">Позиции</span><Boxes size={19} aria-hidden="true"/></div>
        <strong className="text-2xl sm:text-3xl font-semibold tabular-nums leading-none">{items.length}</strong>
      </div>
      <div className="min-h-16 sm:min-h-32 rounded-2xl border border-[#dce4df] bg-white text-[#202b28] px-4 py-3 sm:p-5 flex flex-row sm:flex-col items-center sm:items-stretch justify-between shadow-sm">
        <div className="flex flex-row-reverse sm:flex-row items-center sm:items-start justify-end sm:justify-between gap-3"><span className="text-sm font-medium">Ниже минимума</span><AlertTriangle size={19} aria-hidden="true"/></div>
        <strong className="text-2xl sm:text-3xl font-semibold tabular-nums leading-none">{lowCount}</strong>
      </div>
    </div>
    {showForm&&<form className="glass-panel p-4 space-y-3" onSubmit={e=>{e.preventDefault();setError('');save.mutate({id:editing?.id,name,kind,unit,quantity:Number(quantity),minQuantity:Number(minQuantity),image});}}>
      <div className="flex justify-between items-center"><h2 className="font-semibold">{editing?"Изменить позицию":"Новая складская позиция"}</h2><button type="button" aria-label="Закрыть" onClick={resetForm}><X size={18}/></button></div>
      <label className="block text-sm">Название<input className="inventory-field mt-1 w-full" required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Например, мука пшеничная"/></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">Тип<AdminSelect ariaLabel="Тип складской позиции" value={kind} onChange={v=>setKind(v as Item['kind'])} options={Object.entries(kindLabels).map(([value,label])=>({value,label}))}/></label><label className="text-sm">Единица<AdminSelect ariaLabel="Единица измерения" value={unit} onChange={v=>setUnit(v as Item['unit'])} options={Object.entries(unitLabels).map(([value,label])=>({value,label}))}/></label>
      <label className="text-sm">Сейчас на складе, {unitLabels[unit]}<input className="inventory-field mt-1 w-full" type="number" min="0" step="0.001" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label className="text-sm">Напомнить о пополнении при остатке, {unitLabels[unit]}<input className="inventory-field mt-1 w-full" type="number" min="0" step="0.001" required value={minQuantity} onChange={e=>setMinQuantity(e.target.value)}/></label></div>
      <div className="flex items-center gap-3">
        {image && <div className="h-20 w-20 overflow-hidden rounded-xl border border-(--lg-ring)"><img src={image} alt="" className="h-full w-full object-cover"/></div>}
        <label className="btn-outline inline-flex cursor-pointer items-center gap-2 px-4 py-2"><ImagePlus size={17}/>{uploading?'Загрузка…':image?'Заменить фото':'Добавить фото'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadImage(file);e.currentTarget.value=''}}/></label>
        {image&&<button type="button" className="text-sm text-(--lg-text-muted)" onClick={()=>setImage('')}>Убрать фото</button>}
      </div>
      <button disabled={save.isPending||uploading||!name.trim()||!valid(quantity)||!valid(minQuantity)} className="btn-primary px-5 py-2" type="submit">{save.isPending?'Сохраняем…':editing?'Сохранить изменения':'Создать позицию'}</button>
    </form>}
    {error&&<p role="alert" className="text-rose-600 text-sm">{error}</p>}
    <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-3 min-w-0">
      <div className="hidden md:flex items-center flex-wrap gap-1 rounded-2xl border border-[#dce4df] bg-[#edf1ee] p-1" role="group" aria-label="Тип складской позиции">
        {filters.map(option=><button type="button" key={option.value} aria-pressed={filter===option.value} className={filter===option.value?"inline-flex items-center gap-2 rounded-xl bg-white shadow-sm px-3 py-2.5 text-sm font-semibold text-[#202b28]":"inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[#52625c] hover:bg-white/60"} onClick={()=>setFilter(option.value)}>
          <span>{option.label}</span><span className="rounded-lg bg-[#e5ebe7] px-2 py-0.5 text-xs tabular-nums">{counts[option.value]}</span>
        </button>)}
      </div>
      <div className="md:hidden min-w-0 flex-1">
        <AdminSelect ariaLabel="Фильтр складских позиций" value={filter} onChange={v=>setFilter(v as typeof filter)} options={filters.map(o=>({value:o.value,label:`${o.label} · ${counts[o.value]}`}))}/>
      </div>
      <label className="inventory-search hidden md:flex shrink-0 w-[min(28vw,320px)] min-h-11 items-center gap-2 rounded-2xl border border-[#dce4df] bg-white px-3 text-[#52625c] focus-within:ring-2 focus-within:ring-[#195d40]/15">
        <Search size={18} aria-hidden="true"/>
        <input aria-label="Поиск по складу" className="min-w-0 flex-1 bg-transparent outline-none text-sm text-[#202b28]" placeholder="Поиск по складу" value={search} onChange={e=>setSearch(e.target.value)}/>
        {search&&<button type="button" aria-label="Очистить поиск" onClick={()=>setSearch('')}><X size={16}/></button>}
      </label>
    </div>
    <div className="hidden md:flex flex-wrap items-center gap-2" role="group" aria-label="Состояние остатков">
      {(['ALL','green','yellow','orange','red'] as const).map(state=><button type="button" key={state}
        aria-pressed={statusFilter===state}
        onClick={()=>setStatusFilter(state)}
        className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter===state?'border-[#244837] bg-[#e5eee8] text-[#173d2c]':'border-[#dce4df] bg-white text-[#52625c] hover:bg-[#f0f4f1]'}`}>
        {state!=='ALL'&&<span className={`inventory-status-dot inventory-status-${state}`} aria-hidden="true"/>}
        <span>{state==='ALL'?'Все состояния':statusLabels[state]}</span>
        <span className="tabular-nums opacity-70">{statusCounts[state]}</span>
      </button>)}
    </div>
    <div className="md:hidden">
      <AdminSelect ariaLabel="Состояние остатков" value={statusFilter} onChange={v=>setStatusFilter(v as typeof statusFilter)}
        options={([{value:'ALL',label:'Все состояния'},...(['green','yellow','orange','red'] as const).map(v=>({value:v,label:statusLabels[v]}))]).map(x=>({value:x.value,label:`${x.label} · ${statusCounts[x.value as keyof typeof statusCounts]}`}))}/>
    </div>

    {isLoading?<p>Загружаем склад…</p>:isError?<p role="alert" className="text-rose-600">Не удалось загрузить склад.</p>:filtered.length===0?<div className="glass-panel p-8 text-center"><PackagePlus className="mx-auto mb-3" size={30}/><p>{search||filter!=='ALL'||statusFilter!=='ALL'?'Ничего не найдено':'Склад пуст. Добавьте первую позицию.'}</p></div>:
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {filtered.map(item=><article key={item.id} className={`glass-panel inventory-status-card inventory-card-${stockStatus(item)} min-w-0 overflow-hidden flex flex-col`}>
        <div className="relative h-36 bg-(--lg-fill) overflow-hidden">
          {item.image?<img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover"/>:<div className="h-full flex items-center justify-center text-(--lg-text-muted)"><PackagePlus size={30}/></div>}
          <span className="absolute top-2 right-2 rounded-full px-2 py-1 text-xs bg-white/90 text-slate-700">{kindLabels[item.kind]}</span>
          <span className={`inventory-status-indicator inventory-status-${stockStatus(item)} absolute left-3 top-3`} title={statusLabels[stockStatus(item)]} aria-label={statusLabels[stockStatus(item)]}>
            <span className="inventory-status-dot" aria-hidden="true"/><span>{statusLabels[stockStatus(item)]}</span>
          </span>
        </div>
        <div className="p-3 flex flex-col gap-3 flex-1">
          <div><div className="flex items-start justify-between gap-2"><h3 className="font-semibold leading-tight">{item.name}</h3>{item.updatedAt&&<time className="shrink-0 text-[10px] text-(--lg-text-muted) tabular-nums text-right" dateTime={item.updatedAt} title={new Date(item.updatedAt).toLocaleString('ru-RU')}>{new Date(item.updatedAt).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'})}</time>}</div><p className="text-xs text-(--lg-text-muted) mt-1">Пополнить при ≤ {Number(item.minQuantity).toLocaleString('ru')} {unitLabels[item.unit]}</p></div>
          <form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();setError('');recount.mutate({id:item.id,quantity:Number(drafts[item.id])});}}>
            <label className="text-xs flex-1 min-w-0">Сейчас на складе, {unitLabels[item.unit]}<input aria-label={`Остаток: ${item.name}`} className="inventory-field mt-1" type="number" step=".001" min="0" required value={drafts[item.id]??item.quantity} onChange={e=>setDrafts(d=>({...d,[item.id]:e.target.value}))}/></label>
            <button className="btn-primary p-2.5" type="submit" aria-label={`Сохранить остаток: ${item.name}`} disabled={recount.isPending||drafts[item.id]===undefined||!valid(drafts[item.id])||Number(drafts[item.id])===Number(item.quantity)}><Save size={18}/></button>
          </form>
          {item.kind==='PREPARED'&&<div className="flex flex-wrap gap-2"><button className="btn-outline px-3 py-2 text-xs" onClick={()=>{setRecipeItem(item);setBatchItem(null)}}>Техкарта</button><button className="btn-outline px-3 py-2 text-xs" onClick={()=>{setBatchItem(item);setRecipeItem(null);setBatchAmount('1')}}>Выпустить партию</button></div>}
          <div className="mt-auto pt-2 border-t border-(--lg-ring)">
            <button type="button" className="mb-2 inline-flex items-center gap-1 text-xs text-(--lg-text-muted) hover:underline" onClick={()=>{setAdministration({itemId:item.id,itemName:item.name});window.scrollTo({top:0,behavior:'smooth'})}}><History size={14}/> История изменений</button>
            {deleteTarget?.id===item.id ? (
              <div className="flex items-center gap-2" role="group" aria-label={`Удалить ${item.name}?`}>
                <button type="button" className="btn-outline flex-1 min-w-0 px-3 py-2 text-sm" disabled={remove.isPending} onClick={()=>setDeleteTarget(null)}>Отмена</button>
                <button type="button" className="flex-1 min-w-0 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60" disabled={remove.isPending} onClick={()=>remove.mutate(item.id)}>{remove.isPending?'Удаляем…':'Удалить'}</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" className="btn-outline flex-1 px-3 py-2 inline-flex justify-center items-center gap-1 text-sm" onClick={()=>openEdit(item)}><Pencil size={15}/> Изменить</button>
                <button type="button" aria-label={`Удалить ${item.name}`} className="btn-outline px-3 py-2 text-rose-700" onClick={()=>{setError('');setDeleteTarget(item)}}><Trash2 size={16}/></button>
              </div>
            )}
          </div>
        </div>
      </article>)}
    </div>}

  </div>;
}
