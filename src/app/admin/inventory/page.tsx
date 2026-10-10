'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Search, Save, Plus } from 'lucide-react';

type Item={ id:string;name:string;kind:'RAW'|'PREPARED'|'PACKAGING';unit:'g'|'ml'|'pcs';quantity:string;minQuantity:string;notes:string };
const unitLabels={g:'г',ml:'мл',pcs:'шт.'};
const kindLabels={RAW:'Сырьё',PREPARED:'Полуфабрикат',PACKAGING:'Упаковка'};
async function api(method:'GET'|'POST'|'PATCH', body?:unknown):Promise<{items?:Item[];error?:string}> {
  const res=await fetch('/api/admin/inventory',{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await res.json();
  if(!res.ok) throw new Error(data.error||'Не удалось сохранить');
  return data;
}
export default function InventoryPage(){
  const qc=useQueryClient();
  const [search,setSearch]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [name,setName]=useState('');
  const [kind,setKind]=useState<Item['kind']>('RAW');
  const [unit,setUnit]=useState<Item['unit']>('g');
  const [quantity,setQuantity]=useState('0');
  const [minQuantity,setMinQuantity]=useState('0');
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [error,setError]=useState('');
  const {data,isLoading,isError}=useQuery({queryKey:['admin-inventory'],queryFn:()=>api('GET')});
  const items=data?.items||[];
  const filtered=useMemo(()=>items.filter(x=>x.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))),[items,search]);
  const save=useMutation({mutationFn:(payload:unknown)=>api('POST',payload),onSuccess:()=>{void qc.invalidateQueries({queryKey:['admin-inventory']});setShowForm(false);setName('');setQuantity('0');setMinQuantity('0');setError('');},onError:(e:Error)=>setError(e.message)});
  const recount=useMutation({mutationFn:(payload:unknown)=>api('PATCH',payload),onSuccess:()=>{void qc.invalidateQueries({queryKey:['admin-inventory']});setDrafts({});setError('');},onError:(e:Error)=>setError(e.message)});
  const valid=(s:string)=>s.trim()!=='' && Number.isFinite(Number(s)) && Number(s)>=0 && Math.round(Number(s)*1000)===Number(s)*1000;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="heading-section m-0">Склад</h1><p className="text-sm text-(--lg-text-muted) mt-1">Первичная ревизия · фактические остатки</p></div><button className="btn-primary inline-flex items-center gap-2 px-4 py-2" onClick={()=>setShowForm(x=>!x)}><Plus size={17}/>Добавить позицию</button></header>
    <div className="glass-panel p-4"><div className="flex flex-wrap gap-4 text-sm"><span>Позиций: <b>{items.length}</b></span><span>Ниже минимума: <b>{items.filter(x=>Number(x.quantity)<=Number(x.minQuantity)).length}</b></span></div></div>
    {showForm&&<form className="glass-panel p-4 space-y-3" onSubmit={e=>{e.preventDefault();setError('');save.mutate({name,kind,unit,quantity:Number(quantity),minQuantity:Number(minQuantity)});}}>
      <h2 className="font-semibold">Новая складская позиция</h2>
      <label className="block text-sm">Название<input className="input-pill mt-1 w-full" required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Например, мука пшеничная"/></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">Тип<select className="input-pill mt-1 w-full" value={kind} onChange={e=>setKind(e.target.value as Item['kind'])}>{Object.entries(kindLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="text-sm">Единица<select className="input-pill mt-1 w-full" value={unit} onChange={e=>setUnit(e.target.value as Item['unit'])}>{Object.entries(unitLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-sm">Остаток<input className="input-pill mt-1 w-full" type="number" min="0" step="0.001" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label className="text-sm">Минимальный остаток<input className="input-pill mt-1 w-full" type="number" min="0" step="0.001" required value={minQuantity} onChange={e=>setMinQuantity(e.target.value)}/></label></div>
      <button disabled={save.isPending||!name.trim()||!valid(quantity)||!valid(minQuantity)} className="btn-primary px-5 py-2" type="submit">{save.isPending?'Сохраняем…':'Сохранить позицию'}</button>
    </form>}
    {error&&<p role="alert" className="text-rose-600 text-sm">{error}</p>}
    <label className="flex items-center gap-2 glass-panel px-3 py-2"><Search size={17}/><input aria-label="Поиск по складу" className="bg-transparent outline-none flex-1 min-w-0" placeholder="Найти ингредиент…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    {isLoading?<p>Загружаем склад…</p>:isError?<p role="alert" className="text-rose-600">Ошибка загрузки. Проверьте миграцию БД.</p>:filtered.length===0?<div className="glass-panel p-8 text-center"><PackagePlus className="mx-auto mb-3" size={30}/><p>{search?'Ничего не найдено':'Склад пуст. Добавьте первую позицию.'}</p></div>:<div className="space-y-2">{filtered.map(item=><div key={item.id} className="glass-panel p-4 flex flex-wrap items-end gap-3 justify-between"><div className="min-w-0 flex-1"><strong className="block">{item.name}</strong><span className="text-xs text-(--lg-text-muted)">{kindLabels[item.kind]} · {unitLabels[item.unit]} · минимум {Number(item.minQuantity).toLocaleString('ru')}</span></div><form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();setError('');recount.mutate({id:item.id,quantity:Number(drafts[item.id])});}}><label className="text-xs">Фактически, {unitLabels[item.unit]}<input aria-label={`Остаток: ${item.name}`} className="input-pill mt-1 w-32" type="number" step="0.001" min="0" required value={drafts[item.id]??item.quantity} onChange={e=>setDrafts(d=>({...d,[item.id]:e.target.value}))}/></label><button className="btn-primary p-2.5" type="submit" aria-label={`Сохранить остаток: ${item.name}`} disabled={recount.isPending||drafts[item.id]===undefined||!valid(drafts[item.id])||Number(drafts[item.id])===Number(item.quantity)}><Save size={18}/></button></form></div>)}</div>}
    <p className="text-xs text-(--lg-text-muted)">Изменения остатков сохраняются в журнале движений. Продажи пока не списывают ингредиенты автоматически.</p>
  </div>;
}
