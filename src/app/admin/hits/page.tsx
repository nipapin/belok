'use client';
import { useMemo,useState } from 'react';
import { Flame, Plus, Save, Pin, Ban, RotateCcw } from 'lucide-react';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
type Product={id:string;name:string;price:number;image:string|null;isAvailable:boolean;category?:{name:string}};
type Config={productIds:string[];pinnedIds:string[];excludedIds:string[];suggestedIds:string[];sales:Record<string,number>;limit:number};
const load=async<T,>(url:string):Promise<T>=>{const r=await fetch(url,{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error||'Ошибка загрузки');return data};
export default function AdminHitsPage(){
  const qc=useQueryClient();
  const {data,isPending,isError}=useQuery({queryKey:['admin-hits'],queryFn:()=>load<Config>('/api/admin/hits')});
  const {data:productsData}=useQuery({queryKey:['admin-products'],queryFn:()=>load<{products:Product[]}>('/api/admin/products')});
  const [draft,setDraft]=useState<{pinnedIds:string[];excludedIds:string[];limit:number}|null>(null);
  const [query,setQuery]=useState('');const [error,setError]=useState('');const [saved,setSaved]=useState(false);
  const pins=draft?.pinnedIds??data?.pinnedIds??[];
  const excluded=draft?.excludedIds??data?.excludedIds??[];
  const limit=draft?.limit??data?.limit??6;
  const products=productsData?.products??[];
  const map=useMemo(()=>new Map(products.map(p=>[p.id,p])),[products]);
  const suggested=(data?.productIds??[]).filter(id=>!pins.includes(id)&&!excluded.includes(id));
  const visible=[...pins.filter(id=>!excluded.includes(id)),...suggested].slice(0,limit);
  const change=(next:Partial<{pinnedIds:string[];excludedIds:string[];limit:number}>)=>{setSaved(false);setDraft({pinnedIds:pins,excludedIds:excluded,limit,...next});};
  const save=useMutation({mutationFn:async()=>{const r=await fetch('/api/admin/hits',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:pins,excludedIds:excluded,limit})});const json=await r.json();if(!r.ok)throw Error(json.error||'Ошибка сохранения');return json as Config;},onSuccess:()=>{setDraft(null);setSaved(true);setError('');void qc.invalidateQueries({queryKey:['admin-hits']});},onError:(e:Error)=>setError(e.message)});
  const results=query.trim()?products.filter(p=>p.isAvailable&&!visible.includes(p.id)&&p.name.toLowerCase().includes(query.toLowerCase())).slice(0,8):[];
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="heading-section m-0">Хиты продаж</h1><p className="mt-1 text-sm text-(--lg-text-muted)">Автоматически: самые покупаемые блюда за последние 30 дней. Можно закреплять позиции и исключать неподходящие.</p></div><button className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 disabled:opacity-50" disabled={!draft||save.isPending} onClick={()=>save.mutate()}><Save size={16}/>{save.isPending?'Сохраняем…':'Сохранить'}</button></header>
    {error&&<p className="text-sm text-rose-600" role="alert">{error}</p>}{saved&&<p className="text-sm text-emerald-700" role="status">Настройки сохранены</p>}
    <div className="glass-panel p-4 flex flex-wrap items-center gap-3"><span className="text-sm font-medium">Показывать хитов</span><div className="flex gap-2">{[4,5,6,7,8].map(n=><button key={n} className={`rounded-xl px-3 py-2 text-sm ${limit===n?'bg-neutral-900 text-white':'bg-neutral-100 text-neutral-700'}`} onClick={()=>change({limit:n})}>{n}</button>)}</div><button className="ml-auto text-sm underline" onClick={()=>change({pinnedIds:[],excludedIds:[]})}><RotateCcw size={14} className="inline"/> Сбросить настройки</button></div>
    <div className="relative"><label className="text-sm font-medium">Закрепить блюдо вручную<input className="input-pill mt-1 w-full" placeholder="Название блюда" value={query} onChange={e=>setQuery(e.target.value)}/></label>{results.length>0&&<div className="absolute z-20 w-full rounded-2xl border bg-white shadow-xl overflow-hidden">{results.map(p=><button key={p.id} className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-neutral-100" onClick={()=>{change({pinnedIds:[...pins,p.id].slice(0,limit),excludedIds:excluded.filter(id=>id!==p.id)});setQuery('')}}><Plus size={16}/>{p.name}</button>)}</div>}</div>
    {isPending?<p>Загружаем рейтинг…</p>:isError?<p role="alert">Не удалось загрузить рейтинг</p>:visible.length===0?<div className="glass-panel p-8 text-center"><Flame size={28} className="mx-auto mb-2"/><p>Пока нет завершённых продаж за последние 30 дней. Можно закрепить блюда вручную.</p></div>:<div className="space-y-2">{visible.map((id,i)=>{const p=map.get(id);if(!p)return null;const pinned=pins.includes(id);return <div key={id} className="glass-panel p-3 flex items-center gap-3"><span className="w-5 text-sm tabular-nums text-(--lg-text-muted)">{i+1}</span>{p.image?<img src={p.image} alt="" className="size-12 rounded-xl object-cover"/>:<span className="size-12 rounded-xl bg-neutral-100 flex items-center justify-center"><Flame size={18}/></span>}<div className="min-w-0 flex-1"><strong className="block truncate">{p.name}</strong><p className="text-xs text-(--lg-text-muted)">{p.category?.name??'Блюдо'} · {data?.sales?.[id]??0} шт. за 30 дней · {pinned?'Закреплено':'Автоматически'}</p></div><button className="btn-icon p-2" aria-label={pinned?'Открепить':'Закрепить'} title={pinned?'Открепить':'Закрепить'} onClick={()=>change({pinnedIds:pinned?pins.filter(x=>x!==id):[...pins,id]})}><Pin size={17} fill={pinned?'currentColor':'none'}/></button><button className="btn-icon p-2 text-rose-600" title="Исключить из хитов" aria-label="Исключить из хитов" onClick={()=>change({pinnedIds:pins.filter(x=>x!==id),excludedIds:[...excluded,id]})}><Ban size={17}/></button></div>})}</div>}
    {excluded.length>0&&<section className="glass-panel p-4"><h2 className="font-semibold mb-2">Исключённые товары</h2><div className="flex flex-wrap gap-2">{excluded.map(id=><button key={id} className="rounded-xl border px-3 py-2 text-sm" onClick={()=>change({excludedIds:excluded.filter(x=>x!==id)})}>{map.get(id)?.name??id} ×</button>)}</div></section>}
    <p className="text-xs text-(--lg-text-muted)">Учитываются завершённые оплаченные заказы, а также завершённые наличные и бонусные. Упаковка и одноразовые принадлежности исключаются автоматически. Закреплённые блюда показываются первыми.</p>
  </div>;
}
