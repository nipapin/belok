'use client';
import {useEffect,useState} from 'react';
import RecipeEditor from '@/components/admin/RecipeEditor';

type StockItem={id:string;name:string;kind:string;unit:'g'|'ml'|'pcs';isActive?:boolean};
type Mode='recipe'|'purchased';
export default function ProductAccountingEditor({productId}:{productId:string}){
 const [mode,setMode]=useState<Mode>('recipe');
 const [items,setItems]=useState<StockItem[]>([]);
 const [itemId,setItemId]=useState('');
 const [quantity,setQuantity]=useState('1');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{
  let active=true;
  void Promise.all([
   fetch('/api/admin/inventory').then(async r=>{if(!r.ok)throw Error('Склад недоступен');return r.json()}),
   fetch('/api/admin/inventory/product-links?productId='+encodeURIComponent(productId)).then(async r=>{if(!r.ok)throw Error('Складские привязки пока недоступны');return r.json()})
  ]).then(([inventory,links])=>{
    if(!active)return;
    setItems((inventory.items??[]) as StockItem[]);
    if(links.link){setMode('purchased');setItemId(links.link.itemId);setQuantity(String(links.link.quantity))}
    setLoaded(true);
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Ошибка загрузки')});
  return ()=>{active=false};
 },[productId]);
 const goods=items.filter(x=>['RAW','PACKAGING'].includes(x.kind)&&(x.isActive!==false||x.id===itemId));
 async function saveBinding(){
  setBusy(true);setError('');setMessage('');
  try{
   if(mode==='purchased'&&(!itemId||!Number.isFinite(Number(quantity))||Number(quantity)<=0))throw Error('Выберите складскую позицию и количество');
   const result=await fetch('/api/admin/inventory/product-links',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId,itemId:mode==='purchased'?itemId:null,quantity:Number(quantity)})});
   const payload=await result.json();
   if(!result.ok)throw Error(payload.error??'Не удалось сохранить');
   setMessage(mode==='purchased'?'Складская привязка сохранена. Автосписание при продаже пока отключено.':'Складская привязка снята.');
  }catch(e){setError(e instanceof Error?e.message:'Ошибка')}finally{setBusy(false)}
 }
 return <section className="space-y-4">
  <div className="glass-panel p-4 space-y-3">
   <h2 className="text-lg font-semibold">Учёт продукции</h2>
   <p className="text-sm text-(--lg-text-muted)">Готовый покупной товар не требует технологической карты.</p>
   <div className="grid grid-cols-2 gap-2">
    <button type="button" aria-pressed={mode==='recipe'} className={`rounded-xl border px-3 py-3 text-sm text-left ${mode==='recipe'?'border-emerald-600 ring-1 ring-emerald-600':'border-(--lg-ring)'}`} onClick={()=>setMode('recipe')}>Собственное приготовление</button>
    <button type="button" aria-pressed={mode==='purchased'} className={`rounded-xl border px-3 py-3 text-sm text-left ${mode==='purchased'?'border-emerald-600 ring-1 ring-emerald-600':'border-(--lg-ring)'}`} onClick={()=>setMode('purchased')}>Покупной товар</button>
   </div>
   {mode==='purchased'&&<div className="space-y-3"><label className="block text-sm">Складская позиция<select className="input-pill mt-1 w-full" value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">Выберите товар на складе</option>{goods.map(i=><option key={i.id} value={i.id}>{i.name} · {i.unit}</option>)}</select></label>
   <label className="block text-sm">Количество на одну продажу<input className="input-pill mt-1 w-full" type="number" min=".001" step=".001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
   <p className="text-xs text-(--lg-text-muted)">Например, 1 шт. бутилированного напитка. Складскую позицию сначала добавьте в разделе «Склад».</p></div>}
   {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
   {message&&<p role="status" className="text-sm text-emerald-700">{message}</p>}
   <button type="button" className="btn-primary px-4 py-2" disabled={busy||!loaded} onClick={()=>void saveBinding()}>{busy?'Сохраняем…':'Сохранить тип и складской учёт'}</button>
  </div>
  {mode==='recipe'&&<RecipeEditor ownerKind="PRODUCT" ownerId={productId} outputUnit="pcs"/>}
 </section>;
}
