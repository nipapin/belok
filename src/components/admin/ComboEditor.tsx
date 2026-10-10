'use client';
import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus,Trash2 } from 'lucide-react';
type Product={id:string;name:string;isCombo?:boolean;isAvailable:boolean};
type Group={key:string;name:string;minSelect:number;maxSelect:number;options:{productId:string;priceDelta:number}[]};
const newGroup=():Group=>({key:crypto.randomUUID(),name:'',minSelect:1,maxSelect:1,options:[]});
export default function ComboEditor({productId}:{productId?:string}){
 const router=useRouter();const [name,setName]=useState('');const [price,setPrice]=useState('');const [categoryId,setCategory]=useState('');const [description,setDescription]=useState('');const [groups,setGroups]=useState<Group[]>([newGroup()]);const [products,setProducts]=useState<Product[]>([]);const [categories,setCategories]=useState<{id:string;name:string}[]>([]);
 const [saving,setSaving]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{
  void Promise.all([fetch('/api/admin/products').then(r=>r.json()),fetch('/api/admin/categories').then(r=>r.json())]).then(([p,c])=>{setProducts(p.products??[]);setCategories(c.categories??[])});
  if(productId)void Promise.all([fetch('/api/admin/products/'+productId).then(r=>r.json()),fetch('/api/admin/combos?productId='+productId).then(r=>r.json())]).then(([p,g])=>{
   if(p.product){setName(p.product.name);setPrice(String(p.product.price));setCategory(p.product.categoryId);setDescription(p.product.description??'')}
   if(g.groups?.length)setGroups((g.groups as {id:string;name:string;minSelect:number;maxSelect:number;options:{productId:string;priceDelta:number}[]}[]).map(x=>({key:x.id,name:x.name,minSelect:x.minSelect,maxSelect:x.maxSelect,options:x.options.map(o=>({productId:o.productId,priceDelta:o.priceDelta}))})));
  });
 },[productId]);
 const patch=(index:number,changes:Partial<Group>)=>setGroups(list=>list.map((g,i)=>i===index?{...g,...changes}:g));
 const candidates=products.filter(p=>!p.isCombo&&p.id!==productId);
 async function save(){
  setError('');if(!name.trim()||!categoryId||!Number.isFinite(Number(price))||Number(price)<0){setError('Заполните название, категорию и цену');return;}
  if(groups.some(g=>!g.name.trim()||g.options.length<g.maxSelect||g.options.length<g.minSelect||!g.options.length||g.options.some(o=>!o.productId))){setError('Заполните группы и выберите товары');return;}
  setSaving(true);
  try{
   let id=productId;
   if(!id){
    const res=await fetch('/api/admin/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description,price:Number(price),categoryId,isAvailable:false,isCombo:true})});
    const body=await res.json();if(!res.ok||!body.product?.id)throw Error(body.error||'Не удалось создать товар');
    id=body.product.id;
   }else{
    const res=await fetch('/api/admin/products/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description,price:Number(price),categoryId})});
    if(!res.ok)throw Error((await res.json()).error||'Не удалось обновить товар');
   }
   const res=await fetch('/api/admin/combos',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:id,groups:groups.map(g=>({name:g.name,minSelect:g.minSelect,maxSelect:g.maxSelect,options:g.options}))})});
   if(!res.ok)throw Error((await res.json()).error||'Не удалось сохранить состав');
   router.push('/admin/products');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения')}finally{setSaving(false)}
 }
 return <div className="space-y-5 max-w-3xl">
  <header><h1 className="heading-section">{productId?'Редактировать комбо':'Новое комбо'}</h1><p className="text-sm text-(--lg-text-muted)">Комбо состоит из обычных товаров. Для обязательного товара создайте группу с одним вариантом.</p></header>
  {error&&<p role="alert" className="text-rose-600">{error}</p>}
  <section className="glass-panel p-4 grid gap-3 sm:grid-cols-2">
   <label className="text-sm">Название<input className="input-pill mt-1 w-full" required value={name} onChange={e=>setName(e.target.value)}/></label>
   <label className="text-sm">Базовая цена, ₽<input className="input-pill mt-1 w-full" type="number" min="0" step=".01" value={price} onChange={e=>setPrice(e.target.value)}/></label>
   <label className="text-sm">Категория<select className="input-pill mt-1 w-full" value={categoryId} onChange={e=>setCategory(e.target.value)}><option value="">Выберите категорию</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label className="text-sm">Описание<input className="input-pill mt-1 w-full" value={description} onChange={e=>setDescription(e.target.value)}/></label>
  </section>
  {groups.map((group,i)=><section className="glass-panel p-4 space-y-3" key={group.key}>
   <div className="flex justify-between items-center"><h2 className="font-semibold">Группа {i+1}</h2><button aria-label="Удалить группу" disabled={groups.length<=1} onClick={()=>setGroups(x=>x.filter((_,n)=>n!==i))}><Trash2 size={17}/></button></div>
   <label className="text-sm block">Название группы<input className="input-pill mt-1 w-full" placeholder="Например: Выберите напиток" value={group.name} onChange={e=>patch(i,{name:e.target.value})}/></label>
   <div className="flex gap-3"><label className="text-sm">Минимум<input className="input-pill mt-1 w-full" type="number" min="1" max="10" value={group.minSelect} onChange={e=>patch(i,{minSelect:Number(e.target.value)})}/></label><label className="text-sm">Максимум<input className="input-pill mt-1 w-full" type="number" min="1" max="10" value={group.maxSelect} onChange={e=>patch(i,{maxSelect:Number(e.target.value)})}/></label></div>
   {group.options.map((option,j)=><div key={j} className="flex items-center gap-2"><select aria-label="Товар группы" className="input-pill flex-1 min-w-0" value={option.productId} onChange={e=>patch(i,{options:group.options.map((o,n)=>n===j?{...o,productId:e.target.value}:o)})}><option value="">Выберите товар</option>{candidates.filter(p=>p.id===option.productId||!group.options.some(o=>o.productId===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input aria-label="Доплата в рублях" className="input-pill w-24" type="number" min="0" step=".01" value={option.priceDelta} onChange={e=>patch(i,{options:group.options.map((o,n)=>n===j?{...o,priceDelta:Number(e.target.value)}:o)})}/><button aria-label="Удалить вариант" onClick={()=>patch(i,{options:group.options.filter((_,n)=>n!==j)})}><Trash2 size={16}/></button></div>)}
   <button className="btn-outline px-3 py-2 text-sm inline-flex gap-2" onClick={()=>patch(i,{options:[...group.options,{productId:'',priceDelta:0}]})}><Plus size={16}/>Добавить вариант</button>
  </section>)}
  <button className="btn-outline px-4 py-2" onClick={()=>setGroups(x=>[...x,newGroup()])}><Plus size={16} className="inline"/> Группа выбора</button>
  <div className="flex justify-end gap-2"><button className="btn-ghost px-4" onClick={()=>router.push('/admin/products')}>Отмена</button><button className="btn-primary px-5 py-3" disabled={saving} onClick={()=>void save()}>{saving?'Сохраняем…':'Сохранить комбо'}</button></div>
 </div>;
}
