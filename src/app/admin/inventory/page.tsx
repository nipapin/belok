'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Search, Save, Plus, Pencil, Trash2, ImagePlus, X, Boxes, AlertTriangle } from 'lucide-react';
import RecipeEditor from '@/components/admin/RecipeEditor';
import AdminSelect from '@/components/admin/AdminSelect';
import './inventory.css';

type Item={ id:string;name:string;kind:'RAW'|'PREPARED'|'PACKAGING';unit:'g'|'ml'|'pcs';quantity:string;minQuantity:string;notes:string;image?:string|null };
const unitLabels={g:'г',ml:'мл',pcs:'шт.'};
const kindLabels={RAW:'Сырьё',PREPARED:'Полуфабрикат',PACKAGING:'Упаковка'};
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
  const [mobileSearch,setMobileSearch]=useState(false);
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
  const {data,isLoading,isError}=useQuery({queryKey:['admin-inventory'],queryFn:()=>api('GET')});
  const items=data?.items||[];
  const counts=useMemo(()=>({ALL:items.length,RAW:items.filter(i=>i.kind==='RAW').length,PREPARED:items.filter(i=>i.kind==='PREPARED').length,PACKAGING:items.filter(i=>i.kind==='PACKAGING').length}),[items]);
  const lowCount=items.filter(x=>Number(x.quantity)<=Number(x.minQuantity)).length;
  const filters=[{value:'ALL',label:'Все'},{value:'RAW',label:'Сырьё'},{value:'PREPARED',label:'Полуфабрикаты'},{value:'PACKAGING',label:'Упаковка'}] as const;
  const filtered=useMemo(()=>items.filter(x=>(filter==='ALL'||x.kind===filter)&&x.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))),[items,search,filter]);
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
      <button type="button" className="btn-primary hidden sm:inline-flex items-center gap-2 px-4 py-2" onClick={openCreate}><Plus size={17}/>Добавить позицию</button>
      <div className="flex sm:hidden items-center gap-2">
        <button type="button" className="inventory-icon-button" aria-label={mobileSearch?'Закрыть поиск':'Поиск'} aria-expanded={mobileSearch} onClick={()=>{setMobileSearch(v=>!v);if(mobileSearch)setSearch('')}}>{mobileSearch?<X size={20}/>:<Search size={20}/>}</button>
        <button type="button" className="inventory-icon-button inventory-mobile-add" aria-label="Добавить позицию" onClick={openCreate}><Plus size={21}/></button>
      </div>
    </header>
    {recipeItem&&<div className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">Рецептура: {recipeItem.name}</h2><button className="btn-outline px-3 py-2" onClick={()=>setRecipeItem(null)}>Закрыть</button></div><RecipeEditor key={recipeItem.id} ownerKind="PREPARED" ownerId={recipeItem.id} outputUnit={recipeItem.unit}/></div>}
    {batchItem&&<form className="glass-panel p-4 space-y-3" onSubmit={async e=>{e.preventDefault();setBatchBusy(true);setBatchMessage('');try{const r=await fetch('/api/admin/inventory/batches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preparedItemId:batchItem.id,quantity:Number(batchAmount)})});const data=await r.json();if(!r.ok)throw Error(data.error??'Ошибка');setBatchMessage('Партия выпущена, остатки обновлены');void qc.invalidateQueries({queryKey:['admin-inventory']});setBatchItem(null)}catch(err){setBatchMessage(err instanceof Error?err.message:'Ошибка')}finally{setBatchBusy(false)}}}><div className="flex justify-between"><h2 className="font-semibold">Выпуск: {batchItem.name}</h2><button type="button" className="btn-ghost" onClick={()=>setBatchItem(null)}>Закрыть</button></div><label className="block text-sm">Объём, {unitLabels[batchItem.unit]}<input className="inventory-field mt-1 w-full" type="number" min=".001" step=".001" value={batchAmount} onChange={e=>setBatchAmount(e.target.value)}/></label><button type="submit" className="btn-primary px-5 py-2" disabled={batchBusy||!valid(batchAmount)||Number(batchAmount)===0}>Подтвердить выпуск и списать компоненты</button></form>}
    {batchMessage&&<p role="status" className="text-sm">{batchMessage}</p>}
    <div className="grid grid-cols-2 gap-3 sm:max-w-2xl">
      <div className="inventory-kpi inventory-kpi-primary">
        <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">Позиции</span><Boxes size={19} aria-hidden="true"/></div>
        <strong className="inventory-kpi-value">{items.length}</strong>
      </div>
      <div className="inventory-kpi">
        <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">Ниже минимума</span><AlertTriangle size={19} aria-hidden="true"/></div>
        <strong className="inventory-kpi-value">{lowCount}</strong>
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
    <div className="inventory-toolbar">
      <div className="inventory-filter-pills hidden md:flex" role="group" aria-label="Тип складской позиции">
        {filters.map(option=><button type="button" key={option.value} aria-pressed={filter===option.value} className="inventory-filter-pill" onClick={()=>setFilter(option.value)}>
          <span>{option.label}</span><span className="inventory-filter-count">{counts[option.value]}</span>
        </button>)}
      </div>
      <div className="md:hidden min-w-0 flex-1">
        <AdminSelect ariaLabel="Фильтр складских позиций" value={filter} onChange={v=>setFilter(v as typeof filter)} options={filters.map(o=>({value:o.value,label:`${o.label} · ${counts[o.value]}`}))}/>
      </div>
      <label className="inventory-search hidden md:flex">
        <Search size={18} aria-hidden="true"/>
        <input aria-label="Поиск по складу" placeholder="Поиск по складу" value={search} onChange={e=>setSearch(e.target.value)}/>
        {search&&<button type="button" aria-label="Очистить поиск" onClick={()=>setSearch('')}><X size={16}/></button>}
      </label>
    </div>
    {mobileSearch&&<label className="inventory-search inventory-search-mobile flex md:hidden">
      <Search size={18} aria-hidden="true"/>
      <input autoFocus aria-label="Поиск по складу" placeholder="Поиск по складу" value={search} onChange={e=>setSearch(e.target.value)}/>
      {search&&<button type="button" aria-label="Очистить поиск" onClick={()=>setSearch('')}><X size={16}/></button>}
    </label>}
    {deleteTarget&&<div className="glass-panel p-4 space-y-3"><p>Удалить «{deleteTarget.name}»? Позиции, используемые в движениях или рецептах, удалить нельзя.</p><div className="flex gap-2"><button className="btn-outline px-4 py-2" onClick={()=>setDeleteTarget(null)}>Отмена</button><button className="px-4 py-2 rounded-xl bg-red-600 text-white" disabled={remove.isPending} onClick={()=>remove.mutate(deleteTarget.id)}>Удалить</button></div></div>}
    {isLoading?<p>Загружаем склад…</p>:isError?<p role="alert" className="text-rose-600">Не удалось загрузить склад.</p>:filtered.length===0?<div className="glass-panel p-8 text-center"><PackagePlus className="mx-auto mb-3" size={30}/><p>{search||filter!=='ALL'?'Ничего не найдено':'Склад пуст. Добавьте первую позицию.'}</p></div>:
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {filtered.map(item=><article key={item.id} className="glass-panel min-w-0 overflow-hidden flex flex-col">
        <div className="relative h-36 bg-(--lg-fill) overflow-hidden">
          {item.image?<img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover"/>:<div className="h-full flex items-center justify-center text-(--lg-text-muted)"><PackagePlus size={30}/></div>}
          <span className="absolute top-2 right-2 rounded-full px-2 py-1 text-xs bg-white/90 text-slate-700">{kindLabels[item.kind]}</span>
        </div>
        <div className="p-3 flex flex-col gap-3 flex-1">
          <div><h3 className="font-semibold leading-tight">{item.name}</h3><p className="text-xs text-(--lg-text-muted) mt-1">Пополнить при ≤ {Number(item.minQuantity).toLocaleString('ru')} {unitLabels[item.unit]}</p></div>
          <form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();setError('');recount.mutate({id:item.id,quantity:Number(drafts[item.id])});}}>
            <label className="text-xs flex-1 min-w-0">Сейчас на складе, {unitLabels[item.unit]}<input aria-label={`Остаток: ${item.name}`} className="inventory-field mt-1" type="number" step=".001" min="0" required value={drafts[item.id]??item.quantity} onChange={e=>setDrafts(d=>({...d,[item.id]:e.target.value}))}/></label>
            <button className="btn-primary p-2.5" type="submit" aria-label={`Сохранить остаток: ${item.name}`} disabled={recount.isPending||drafts[item.id]===undefined||!valid(drafts[item.id])||Number(drafts[item.id])===Number(item.quantity)}><Save size={18}/></button>
          </form>
          {item.kind==='PREPARED'&&<div className="flex flex-wrap gap-2"><button className="btn-outline px-3 py-2 text-xs" onClick={()=>{setRecipeItem(item);setBatchItem(null)}}>Техкарта</button><button className="btn-outline px-3 py-2 text-xs" onClick={()=>{setBatchItem(item);setRecipeItem(null);setBatchAmount('1')}}>Выпустить партию</button></div>}
          <div className="flex gap-2 mt-auto pt-2 border-t border-(--lg-ring)">
            <button className="btn-outline flex-1 px-3 py-2 inline-flex justify-center items-center gap-1 text-sm" onClick={()=>openEdit(item)}><Pencil size={15}/> Изменить</button>
            <button aria-label={`Удалить ${item.name}`} className="btn-outline px-3 py-2 text-rose-700" onClick={()=>setDeleteTarget(item)}><Trash2 size={16}/></button>
          </div>
        </div>
      </article>)}
    </div>}

  </div>;
}
