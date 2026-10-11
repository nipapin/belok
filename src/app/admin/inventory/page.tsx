'use client';
import { useMemo, useState } from 'react';
import {createPortal} from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Search, Plus, Pencil, Trash2, ImagePlus, X, Boxes, AlertTriangle, ShieldCheck, ArrowDownLeft, ArrowUpRight, ClipboardCheck } from 'lucide-react';
import RecipeEditor from '@/components/admin/RecipeEditor';
import AdminSelect from '@/components/admin/AdminSelect';
import InventoryAdministration from '@/components/admin/InventoryAdministration';
import StockOperationModal from '@/components/admin/StockOperationModal';
import StockMovements from '@/components/admin/StockMovements';
import InventoryCardMenu from '@/components/admin/InventoryCardMenu';
import {inventoryKinds, inventoryKindLabels, stockMilli, type InventoryKind, type StockReason} from '@/lib/inventoryStock';
import './inventory.css';

type Item={ id:string;name:string;kind:InventoryKind;unit:'g'|'ml'|'pcs';quantity:string;minQuantity:string;notes:string;image?:string|null;updatedAt?:string };
const unitLabels={g:'г',ml:'мл',pcs:'шт.'};
const kindLabels=inventoryKindLabels;
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

async function api(method:'GET'|'POST'|'PATCH'|'PUT', body?:unknown):Promise<{items?:Item[];item?:Item;error?:string}> {
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
  const [kind,setKind]=useState<Item['kind']>('UNSPECIFIED');
  const [unit,setUnit]=useState<Item['unit']>('g');
  const [stockOperation,setStockOperation]=useState<{item:Item;reason:StockReason}|null>(null);
  const [movementItem,setMovementItem]=useState<Item|null>(null);
  const [notes,setNotes]=useState('');
  const [minQuantity,setMinQuantity]=useState('0');
  const [error,setError]=useState('');
  const [deleteTarget,setDeleteTarget]=useState<Item|null>(null);
  const [administration,setAdministration]=useState<{itemId?:string;itemName?:string}|null>(null);
  const {data,isLoading,isError}=useQuery({queryKey:['admin-inventory'],queryFn:()=>api('GET')});
  const items=data?.items||[];
  const counts=useMemo(()=>({ALL:items.length,UNSPECIFIED:items.filter(i=>i.kind==='UNSPECIFIED').length,RAW:items.filter(i=>i.kind==='RAW').length,PURCHASED:items.filter(i=>i.kind==='PURCHASED').length,PREPARED:items.filter(i=>i.kind==='PREPARED').length,PACKAGING:items.filter(i=>i.kind==='PACKAGING').length}),[items]);
  const lowCount=items.filter(x=>stockStatus(x)==='red').length;
  const statusCounts=useMemo(()=>({ALL:items.length,green:items.filter(x=>stockStatus(x)==='green').length,yellow:items.filter(x=>stockStatus(x)==='yellow').length,orange:items.filter(x=>stockStatus(x)==='orange').length,red:items.filter(x=>stockStatus(x)==='red').length}),[items]);
  const filters: {value:'ALL'|InventoryKind;label:string}[]=[{value:'ALL',label:'Все'},...inventoryKinds.map(value=>({value,label:kindLabels[value]}))];
  const filtered=useMemo(()=>items.filter(x=>(filter==='ALL'||x.kind===filter)&&(statusFilter==='ALL'||stockStatus(x)===statusFilter)&&x.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))),[items,search,filter,statusFilter]);
  const resetForm=()=>{setShowForm(false);setEditing(null);setName('');setKind('UNSPECIFIED');setUnit('g');setNotes('');setMinQuantity('0');setImage('');setError('')};
  const openCreate=()=>{resetForm();setShowForm(true)};
  const openEdit=(item:Item)=>{setEditing(item);setName(item.name);setKind(item.kind);setUnit(item.unit);setNotes(item.notes??'');setMinQuantity(String(Number(item.minQuantity)));setImage(item.image??'');setShowForm(true);setError('')};
  const uploadImage=async (file:File)=>{setUploading(true);setError('');try{const data=new FormData();data.append('file',file);data.append('folder','products');const res=await fetch('/api/upload',{method:'POST',body:data});const result=await res.json();if(!res.ok)throw Error(result.error??'Ошибка загрузки');setImage(result.url)}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки')}finally{setUploading(false)}};
  const save=useMutation({mutationFn:(payload:unknown)=>api(editing?'PUT':'POST',payload),onSuccess:(result)=>{void qc.invalidateQueries({queryKey:['admin-inventory']});resetForm();if(!editing&&result.item)setStockOperation({item:result.item,reason:'OPENING'})},onError:(e:Error)=>setError(e.message)});
  const remove=useMutation({mutationFn:async(id:string)=>{const r=await fetch('/api/admin/inventory?id='+encodeURIComponent(id),{method:'DELETE'});const data=await r.json();if(!r.ok)throw Error(data.error??'Ошибка удаления');return data},onSuccess:()=>{setDeleteTarget(null);void qc.invalidateQueries({queryKey:['admin-inventory']})},onError:(e:Error)=>setError(e.message)});
  const quantityInput=(value:string)=>value.replace(/[^0-9.,]/g,'');
  const valid=(s:string,measure:Item['unit']=unit)=>{try{stockMilli(s,measure);return true}catch{return false}};
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
    {batchItem&&<form className="glass-panel p-4 space-y-3" onSubmit={async e=>{e.preventDefault();setBatchBusy(true);setBatchMessage('');try{const r=await fetch('/api/admin/inventory/batches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preparedItemId:batchItem.id,quantity:Number(batchAmount.replace(',','.'))})});const data=await r.json();if(!r.ok)throw Error(data.error??'Ошибка');setBatchMessage('Партия выпущена, остатки обновлены');void qc.invalidateQueries({queryKey:['admin-inventory']});setBatchItem(null)}catch(err){setBatchMessage(err instanceof Error?err.message:'Ошибка')}finally{setBatchBusy(false)}}}><div className="flex justify-between"><h2 className="font-semibold">Выпуск: {batchItem.name}</h2><button type="button" className="btn-ghost" onClick={()=>setBatchItem(null)}>Закрыть</button></div><label className="block text-sm">Объём, {unitLabels[batchItem.unit]}<input className="inventory-field mt-1 w-full" type="text" inputMode="decimal" value={batchAmount} onChange={e=>setBatchAmount(quantityInput(e.target.value))}/></label><button type="submit" className="btn-primary px-5 py-2" disabled={batchBusy||!valid(batchAmount,batchItem.unit)||Number(batchAmount.replace(',','.'))===0}>Подтвердить выпуск и списать компоненты</button></form>}
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
    {showForm&&createPortal(<div className="inventory-modal-root inventory-overlay-theme"><button type="button" className="inventory-modal-backdrop" aria-label="Закрыть форму" onClick={resetForm}/><form role="dialog" aria-modal="true" aria-label={editing?"Изменить позицию":"Новая складская позиция"} className="inventory-modal-panel space-y-3" onSubmit={e=>{e.preventDefault();setError('');save.mutate({id:editing?.id,name,kind,unit,minQuantity:minQuantity.replace(',','.'),notes,image});}}>
      <div className="flex justify-between items-center"><h2 className="font-semibold">{editing?"Изменить позицию":"Новая складская позиция"}</h2><button type="button" aria-label="Закрыть" onClick={resetForm}><X size={18}/></button></div>
      <div className="inventory-photo-area">
        <label className={`inventory-photo-tile${image?' inventory-photo-tile-filled':''}`}>
          {image ? (
            <img src={image} alt="" className="inventory-photo-preview"/>
          ) : (
            <span className="inventory-photo-placeholder">
              <span className="inventory-photo-symbol"><ImagePlus size={24} strokeWidth={1.7}/></span>
              <span className="inventory-photo-title">Добавить фото</span>
              <span className="inventory-photo-hint">JPEG, PNG, WebP или GIF</span>
            </span>
          )}
          {image&&<span className="inventory-photo-replace"><ImagePlus size={19}/> Заменить фото</span>}
          {uploading&&<span className="inventory-photo-loading">Загрузка фото…</span>}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadImage(file);e.currentTarget.value=''}}/>
        </label>
        {image&&<button type="button" className="inventory-photo-remove" aria-label="Убрать фото" onClick={()=>setImage('')}><X size={18}/></button>}
      </div>
      <label className="block text-sm">Название<input className="inventory-field mt-1 w-full" required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Например, мука пшеничная"/></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-sm">Тип<AdminSelect ariaLabel="Тип складской позиции" value={kind} onChange={v=>setKind(v as Item['kind'])} options={Object.entries(kindLabels).map(([value,label])=>({value,label}))}/></label><label className="text-sm">Единица<AdminSelect ariaLabel="Единица измерения" value={unit} onChange={v=>setUnit(v as Item['unit'])} options={Object.entries(unitLabels).map(([value,label])=>({value,label}))}/></label>
      <label className="text-sm">Напомнить о пополнении при остатке, {unitLabels[unit]}<input className="inventory-field mt-1 w-full" type="text" inputMode="decimal" required value={minQuantity} onChange={e=>setMinQuantity(quantityInput(e.target.value))}/></label></div>
      <p className="text-sm text-(--lg-text-muted)">Тип можно указать позже через «Изменить». Остатки и история сохранятся.</p>
      <label className="block text-sm">Примечание<textarea className="inventory-field mt-1" maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      {!editing&&<p className="text-sm text-(--lg-text-muted)">Создаём карточку с нулевым остатком. Затем откроется отдельная операция внесения начального остатка.</p>}
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={save.isPending||uploading||!name.trim()||!valid(minQuantity)} className="inventory-modal-submit px-5 py-2" type="submit">{save.isPending?'Сохраняем…':editing?'Сохранить изменения':'Создать позицию'}</button>
    </form></div>,document.body)}
    {stockOperation&&<StockOperationModal key={stockOperation.item.id+stockOperation.reason} item={stockOperation.item} reason={stockOperation.reason} onClose={()=>setStockOperation(null)} onSuccess={()=>{setStockOperation(null);void qc.invalidateQueries({queryKey:['admin-inventory']})}}/>}
    {movementItem&&<StockMovements itemId={movementItem.id} itemName={movementItem.name} onClose={()=>setMovementItem(null)}/>}
    {!showForm&&error&&<p role="alert" className="text-rose-600 text-sm">{error}</p>}
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

    {isLoading?<p>Загружаем склад…</p>:isError?<p role="alert" className="text-rose-600">Не удалось загрузить склад.</p>:filtered.length===0?<div className="flex min-h-[240px] flex-col items-center justify-center gap-3 py-12 text-center text-[#61726b]"><PackagePlus className="mb-1 opacity-65" size={56} strokeWidth={1.3}/><p className="text-sm font-medium text-[#52635b]">{search||filter!=='ALL'||statusFilter!=='ALL'?'Ничего не найдено':'Склад пуст. Добавьте первую позицию.'}</p></div>:
    <div className="inventory-card-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {filtered.map(item=><article key={item.id} className={`glass-panel inventory-status-card inventory-card-${stockStatus(item)} min-w-0 overflow-hidden flex flex-col`}>
        <InventoryCardMenu name={item.name} onAudit={()=>setAdministration({itemId:item.id,itemName:item.name})} onMovements={()=>setMovementItem(item)}/>
        <div className="relative h-32 bg-(--lg-fill) overflow-hidden">
          {item.image?<img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover"/>:<div className="h-full flex items-center justify-center text-(--lg-text-muted)"><PackagePlus size={30}/></div>}
          <span className={`inventory-status-indicator inventory-status-${stockStatus(item)} absolute left-3 top-3`} title={statusLabels[stockStatus(item)]} aria-label={statusLabels[stockStatus(item)]}>
            <span className="inventory-status-dot" aria-hidden="true"/><span>{statusLabels[stockStatus(item)]}</span>
          </span>
        </div>
        <div className="p-3 flex flex-col gap-3 flex-1">
          <div><div className="flex items-start justify-between gap-2"><h3 className="font-semibold leading-tight break-words min-w-0">{item.name}</h3>{item.updatedAt&&<time className="shrink-0 text-[10px] text-(--lg-text-muted) tabular-nums text-right" dateTime={item.updatedAt} title={new Date(item.updatedAt).toLocaleString('ru-RU')}>{new Date(item.updatedAt).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'})}</time>}</div><p className="inventory-card-kind">{kindLabels[item.kind]}</p><p className="text-xs text-(--lg-text-muted) mt-1">Пополнить при ≤ {Number(item.minQuantity).toLocaleString('ru',{maximumFractionDigits:3})} {unitLabels[item.unit]}</p></div>
          <p className="text-xl font-semibold tabular-nums">{Number(item.quantity).toLocaleString('ru-RU',{maximumFractionDigits:3})} <span className="text-sm font-normal">{unitLabels[item.unit]}</span></p>
          <div className="inventory-card-actions">
            {item.kind!=='PREPARED'&&<button type="button" onClick={()=>setStockOperation({item,reason:'RECEIPT'})}><ArrowDownLeft size={14}/>Приход</button>}
            <button type="button" className={item.kind==='PREPARED'?'inventory-card-action-wide':undefined} onClick={()=>setStockOperation({item,reason:'WRITE_OFF'})}><ArrowUpRight size={14}/>Списание</button>
            <button type="button" className="inventory-card-action-wide" onClick={()=>setStockOperation({item,reason:'RECOUNT'})}><ClipboardCheck size={14}/>Инвентаризация</button>
            {Number(item.quantity)===0&&<button type="button" className="inventory-card-action-wide" onClick={()=>setStockOperation({item,reason:'OPENING'})}><Plus size={14}/>Начальный остаток</button>}
          </div>
          {item.kind==='PREPARED'&&<div className="flex flex-wrap gap-2"><button className="btn-outline px-3 py-2 text-xs" onClick={()=>{setRecipeItem(item);setBatchItem(null)}}>Техкарта</button><button className="btn-outline px-3 py-2 text-xs" onClick={()=>{setBatchItem(item);setRecipeItem(null);setBatchAmount('1')}}>Выпустить партию</button></div>}
          <div className="mt-auto pt-2 border-t border-(--lg-ring)">
            {deleteTarget?.id===item.id ? (
              <div className="space-y-2"><p className="text-xs text-(--lg-text-muted)">Убрать из каталога? История сохранится. Остаток должен быть нулевым.</p>
              <div className="flex items-center gap-2" role="group" aria-label={`Удалить ${item.name}?`}>
                <button type="button" className="btn-outline flex-1 min-w-0 px-3 py-2 text-sm" disabled={remove.isPending} onClick={()=>setDeleteTarget(null)}>Отмена</button>
                <button type="button" className="flex-1 min-w-0 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60" disabled={remove.isPending} onClick={()=>remove.mutate(item.id)}>{remove.isPending?'Удаляем…':'Удалить'}</button>
              </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" className="inventory-card-edit" onClick={()=>openEdit(item)}><Pencil size={14}/> Изменить</button>
                <button type="button" aria-label={`Удалить ${item.name}`} className="inventory-card-delete" onClick={()=>{setError('');setDeleteTarget(item)}}><Trash2 size={15}/></button>
              </div>
            )}
          </div>
        </div>
      </article>)}
    </div>}

  </div>;
}
