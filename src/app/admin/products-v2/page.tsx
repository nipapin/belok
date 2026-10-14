'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useQuery} from '@tanstack/react-query';
import {Plus, Search, ClipboardList, ChevronRight} from 'lucide-react';
import {fetchAdminJson} from '@/lib/adminDashboard';
import '../manager/manager.css';
type Product={id:string;name:string;price:number;isAvailable:boolean;category?:{name:string}};
type Recipe={ownerId:string;ownerKind:string;recipeId:string|null;lineCount:number};
export default function ProductsV2Page(){
  const [search,setSearch]=useState(''),[missing,setMissing]=useState(false);
  const data=useQuery({queryKey:['admin-products-v2'],queryFn:async()=>{
    const [products,recipes]=await Promise.all([
      fetchAdminJson<{products:Product[]}>('/api/admin/products'),
      fetchAdminJson<{recipes:Recipe[]}>('/api/admin/inventory/recipes'),
    ]);
    return {products:products.products,recipes:recipes.recipes.filter(r=>r.ownerKind==='PRODUCT')};
  }});
  const recipes=new Map((data.data?.recipes??[]).map(r=>[r.ownerId,r]));
  const products=data.data?.products??[];
  const visible=products.filter(p=>p.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))&&(!missing||!recipes.get(p.id)?.recipeId));
  return <div className="manager-space">
    <header className="manager-heading"><div><p className="dashboard-eyebrow">МЕНЮ И РЕЦЕПТУРЫ</p><h1>Товары 2.0</h1><p>Собирайте базу от блюда: состав, заготовки, сырьё и упаковка.</p></div><Link href="/admin/products-v2/new" className="manager-button"><Plus size={18}/> Создать товар</Link></header>
    <div className="manager-note">Это товары из существующего меню. Новые товары создаются выключенными из продажи. При добавлении компонентов остатки не нужны — внесёте их при инвентаризации.</div>
    <div className="manager-tools"><label><span>Поиск</span><div className="manager-search"><Search size={18}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Название блюда"/></div></label><label className="manager-check"><input type="checkbox" checked={missing} onChange={e=>setMissing(e.target.checked)}/> Без сохранённой техкарты</label></div>
    {data.isPending?<p role="status">Загружаем товары…</p>:data.isError?<div role="alert" className="manager-note">Не удалось загрузить товары и рецептуры. <button type="button" onClick={()=>void data.refetch()}>Повторить</button></div>:<section className="manager-panel manager-list">
      <p className="manager-caption">Товаров: {products.length} · С техкартой: {products.filter(p=>recipes.get(p.id)?.recipeId).length}</p>
      {visible.map(product=><Link key={product.id} className="manager-list-row" href={`/admin/products-v2/${product.id}/edit`}><span><strong>{product.name}</strong><small>{product.category?.name??'Товар'} · {Number(product.price).toLocaleString('ru-RU')} ₽ · {product.isAvailable?'В продаже':'Выключен из продажи'}</small></span><span className={`manager-badge ${recipes.get(product.id)?.recipeId?'available':'unconfigured'}`}>{recipes.get(product.id)?.recipeId?`Компонентов: ${recipes.get(product.id)?.lineCount}`:'Заполнить состав'}</span><ChevronRight size={18}/></Link>)}
      {!visible.length&&<div className="manager-empty"><ClipboardList size={32}/><h2>Товары не найдены</h2><p>Измените поиск или создайте новое блюдо.</p><Link href="/admin/products-v2/new" className="manager-button">Создать товар</Link></div>}
    </section>}
  </div>;
}
