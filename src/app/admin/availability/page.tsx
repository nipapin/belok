'use client';
import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
type Product={id:string;name:string;isAvailable:boolean};
export default function AvailabilityPage(){
 const client=useQueryClient();const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState('');
 const {data,isPending,isError}=useQuery({queryKey:['staff-availability'],queryFn:async()=>{const r=await fetch('/api/admin/availability',{cache:'no-store'});if(!r.ok)throw Error('Нет доступа');return await r.json() as {products:Product[]}}});
 async function toggle(product:Product){setBusy(product.id);setError('');try{const r=await fetch('/api/admin/availability',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:product.id,isAvailable:!product.isAvailable})});const d=await r.json();if(!r.ok)throw Error(d.error);await client.invalidateQueries({queryKey:['staff-availability']});await client.invalidateQueries({queryKey:['products']});}catch(e){setError((e as Error).message)}finally{setBusy(null)}}
 return <div><h1 className="heading-section mb-2">Стоп-лист</h1><p className="mb-6 text-sm text-(--lg-text-muted)">Отметьте блюда, которые кухня временно не может приготовить.</p>{(error||isError)&&<p role="alert">{error||'Не удалось загрузить блюда'}</p>}{isPending&&<p>Загружаем…</p>}<div className="space-y-3">{data?.products.map(product=><div key={product.id} className="glass-panel flex items-center justify-between gap-3 p-4"><span className="min-w-0">{product.name}</span><button type="button" className="btn-outline shrink-0 px-3 py-2 text-sm" disabled={busy!==null} onClick={()=>void toggle(product)}>{product.isAvailable?'Доступно':'В стоп-листе'}</button></div>)}</div></div>
}
