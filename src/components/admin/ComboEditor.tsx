'use client';
import { useEffect,useState } from 'react';
import AdminProductImageField from '@/components/admin/AdminProductImageField';
import { useRouter } from 'next/navigation';
import { Plus,Trash2, Pencil, Search, Check, X } from 'lucide-react';
type Product={id:string;name:string;image?:string|null;categoryId?:string;isCombo?:boolean;isAvailable:boolean};
type Group={key:string;name:string;minSelect:number;maxSelect:number;options:{productId:string;priceDelta:number}[]};
const newGroup=():Group=>({key:crypto.randomUUID(),name:'Позиция',minSelect:1,maxSelect:1,options:[]});
export default function ComboEditor({productId}:{productId?:string}){
 const router=useRouter();const [name,setName]=useState('');const [image,setImage]=useState('');const [imageFile,setImageFile]=useState<File|null>(null);const [preview,setPreview]=useState<string|null>(null);const [price,setPrice]=useState('');const [categoryId,setCategory]=useState('');const [description,setDescription]=useState('');const [groups,setGroups]=useState<Group[]>([]);const [products,setProducts]=useState<Product[]>([]);const [categories,setCategories]=useState<{id:string;name:string}[]>([]);
 const [saving,setSaving]=useState(false);const [error,setError]=useState('');
 const [editingKey,setEditingKey]=useState<string|null>(null);
 const [selectedIds,setSelectedIds]=useState<string[]>([]);
 const [search,setSearch]=useState('');
 const [filterCategory,setFilterCategory]=useState('');
 useEffect(()=>{
  void Promise.all([fetch('/api/admin/products').then(r=>r.json()),fetch('/api/admin/categories').then(r=>r.json())]).then(([p,c])=>{setProducts(p.products??[]);setCategories(c.categories??[])});
  if(productId)void Promise.all([fetch('/api/admin/products/'+productId).then(r=>r.json()),fetch('/api/admin/combos?productId='+productId).then(r=>r.json())]).then(([p,g])=>{
   if(p.product){setName(p.product.name);setPrice(String(p.product.price));setCategory(p.product.categoryId);setDescription(p.product.description??'');setImage(p.product.image??'')}
   if(g.groups?.length)setGroups((g.groups as {id:string;name:string;minSelect:number;maxSelect:number;options:{productId:string;priceDelta:number}[]}[]).map(x=>({key:x.id,name:x.name,minSelect:x.minSelect,maxSelect:x.maxSelect,options:x.options.map(o=>({productId:o.productId,priceDelta:o.priceDelta}))})));
  });
 },[productId]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 const patch=(index:number,changes:Partial<Group>)=>setGroups(list=>list.map((g,i)=>i===index?{...g,...changes}:g));
 const candidates=products.filter(p=>!p.isCombo&&p.id!==productId);
 const filtered=candidates.filter(p=>(!filterCategory||p.categoryId===filterCategory)&&p.name.toLowerCase().includes(search.toLowerCase()));
 function openPicker(key:string){const group=groups.find(g=>g.key===key);setSelectedIds(group?.options.map(o=>o.productId)??[]);setSearch('');setFilterCategory('');setEditingKey(key);}
 function finishPicker(){if(!editingKey||!selectedIds.length)return;setGroups(current=>current.map(g=>g.key===editingKey?{...g,name:g.name==='Позиция'?(selectedIds.length===1?(candidates.find(p=>p.id===selectedIds[0])?.name??'Позиция'):'Выберите товар'):g.name,options:selectedIds.map(productId=>g.options.find(o=>o.productId===productId)??{productId,priceDelta:0})}:g));setEditingKey(null);}
 function startPosition(){const group=newGroup();setGroups(current=>[...current,group]);openPicker(group.key);setEditingKey(group.key);setSelectedIds([]);setSearch('');setFilterCategory('');}
 function closePicker(){if(editingKey){setGroups(current=>current.filter(g=>g.key!==editingKey||g.options.length>0));}setEditingKey(null);}
 async function save(){
  setError('');if(!name.trim()||!categoryId||!Number.isFinite(Number(price))||Number(price)<0){setError('Заполните название, категорию и цену');return;}
  if(!groups.length||groups.some(g=>!g.name.trim()||g.options.length<1||g.options.some(o=>!o.productId))){setError('Заполните группы и выберите товары');return;}
  setSaving(true);
  try{
   let imageUrl=image;
   if(imageFile){const fd=new FormData();fd.append('file',imageFile);const uploaded=await fetch('/api/upload',{method:'POST',body:fd,credentials:'include'});const response=await uploaded.json();if(!uploaded.ok)throw Error(response.error||'Ошибка загрузки фото');imageUrl=response.url;}
   let id=productId;
   if(!id){
    const res=await fetch('/api/admin/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description,price:Number(price),categoryId,image:imageUrl,isAvailable:false,isCombo:true})});
    const body=await res.json();if(!res.ok||!body.product?.id)throw Error(body.error||'Не удалось создать товар');
    id=body.product.id;
   }else{
    const res=await fetch('/api/admin/products/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description,price:Number(price),categoryId,image:imageUrl})});
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
  <section className="glass-panel w-full p-4"><AdminProductImageField previewUrl={preview||image||null} onFileSelect={file=>{setImageFile(file);setPreview(URL.createObjectURL(file))}} onClear={()=>{setImage('');setImageFile(null);setPreview(null)}}/></section>
  {groups.map((group,i)=><section className="glass-panel p-4 space-y-4" key={group.key}>
   <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-lg">Позиция {i+1}</h2><div className="flex gap-3"><button type="button" className="btn-icon" aria-label="Изменить состав позиции" onClick={()=>openPicker(group.key)}><Pencil size={19}/></button><button type="button" className="btn-icon" aria-label="Удалить позицию" onClick={()=>setGroups(x=>x.filter(g=>g.key!==group.key))}><Trash2 size={19}/></button></div></div>
   <label className="text-sm block">Название позиции<input className="input-pill mt-1 w-full" value={group.name} onChange={e=>patch(i,{name:e.target.value})} placeholder="Например: Напиток"/></label>
   <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{group.options.map((option,j)=>{const product=candidates.find(p=>p.id===option.productId);return <div key={option.productId} className="rounded-2xl border border-(--lg-ring) overflow-hidden">
     <div className="aspect-square bg-(--lg-fill)">{product?.image?<img src={product.image} alt="" className="h-full w-full object-cover" />:<div className="flex h-full items-center justify-center text-(--lg-text-muted)">Без фото</div>}</div>
     <div className="space-y-2 p-2"><p className="text-sm font-medium leading-snug">{product?.name??'Товар удалён'}</p><label className="text-xs text-(--lg-text-muted)">Доплата, ₽<input aria-label={`Доплата: ${product?.name??''}`} className="input-pill mt-1 w-full" type="number" min="0" step=".01" value={option.priceDelta} onChange={e=>patch(i,{options:group.options.map((o,n)=>n===j?{...o,priceDelta:Number(e.target.value)}:o)})}/></label></div>
    </div>})}</div>
   <label className="flex items-center justify-between gap-3 rounded-xl bg-(--lg-fill) p-3"><span><strong className="block text-sm">Можно отказаться</strong><small className="text-(--lg-text-muted)">Клиент сможет заказать комбо без этой позиции</small></span><input type="checkbox" role="switch" aria-label="Можно отказаться от позиции" className="size-5 shrink-0 accent-emerald-700" checked={group.minSelect===0} onChange={e=>patch(i,{minSelect:e.target.checked?0:1,maxSelect:1})}/></label>
  </section>)}
  <button type="button" className="btn-outline w-full min-h-16 flex items-center justify-center gap-2 text-base font-semibold" onClick={startPosition}><Plus size={22}/> Позиция</button>
  {editingKey&&<div className="fixed inset-0 z-[2000] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
    <button type="button" className="absolute inset-0 bg-black/55" onClick={closePicker} aria-label="Закрыть выбор"/>
    <section role="dialog" aria-modal="true" aria-label="Выбор товаров для позиции" className="glass-panel-strong relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
      <div className="flex items-center justify-between gap-3 border-b border-(--lg-ring) p-4"><div><h2 className="text-lg font-semibold">Товары для позиции</h2><p className="text-xs text-(--lg-text-muted)">Выберите несколько товаров — покупатель выберет один из них</p></div><button type="button" className="btn-icon shrink-0" onClick={closePicker} aria-label="Закрыть"><X size={21}/></button></div>
      <div className="flex gap-2 p-3"><label className="relative flex-1"><Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-(--lg-text-muted)"/><input className="input-pill w-full pl-10" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Найти товар"/></label><select className="input-pill max-w-[40%]" aria-label="Категория товаров" value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}><option value="">Все</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{filtered.map(product=>{const checked=selectedIds.includes(product.id);return <button type="button" key={product.id} aria-pressed={checked} className={`relative overflow-hidden rounded-2xl border text-left ${checked?'border-emerald-600 ring-2 ring-emerald-600':'border-(--lg-ring)'}`} onClick={()=>setSelectedIds(ids=>checked?ids.filter(id=>id!==product.id):[...ids,product.id])}><div className="aspect-4/3 bg-(--lg-fill)">{product.image?<img src={product.image} alt="" className="h-full w-full object-cover"/>:<span className="flex h-full items-center justify-center text-xs text-(--lg-text-muted)">Без фото</span>}</div>{checked&&<span className="absolute right-2 top-2 rounded-full bg-emerald-700 p-1 text-white"><Check size={17}/></span>}<div className="p-2 text-sm font-medium">{product.name}</div></button>})}</div>{filtered.length===0&&<p className="py-8 text-center text-sm text-(--lg-text-muted)">Ничего не найдено</p>}</div>
      <div className="flex items-center justify-between gap-3 border-t border-(--lg-ring) p-4"><span className="text-sm text-(--lg-text-muted)">Выбрано: {selectedIds.length}</span><button type="button" disabled={!selectedIds.length} className="btn-primary min-w-32 px-5 py-3" onClick={finishPicker}>Готово</button></div>
    </section>
  </div>}
  <div className="flex justify-end gap-2"><button className="btn-ghost px-4" onClick={()=>router.push('/admin/products')}>Отмена</button><button className="btn-primary px-5 py-3" disabled={saving} onClick={()=>void save()}>{saving?'Сохраняем…':'Сохранить комбо'}</button></div>
 </div>;
}
