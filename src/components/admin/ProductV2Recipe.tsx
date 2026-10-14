'use client';
import Link from 'next/link';
import {useQuery} from '@tanstack/react-query';
import {ArrowLeft, Pencil} from 'lucide-react';
import RecipeEditor from './RecipeEditor';
import {fetchAdminJson} from '@/lib/adminDashboard';
import {useAuthStore} from '@/store/authStore';
import {hasPermission} from '@/lib/roles';
import '@/app/admin/manager/manager.css';
export default function ProductV2Recipe({id}:{id:string}){
  const user=useAuthStore(s=>s.user);
  const product=useQuery({queryKey:['admin-product',id],queryFn:()=>fetchAdminJson<{product:{id:string;name:string;isAvailable:boolean}}>(`/api/admin/products/${encodeURIComponent(id)}`)});
  return <div className="manager-space">
    <Link href="/admin/products-v2" className="manager-button"><ArrowLeft size={18}/> Все товары</Link>
    {product.isPending?<p role="status">Загружаем товар…</p>:product.isError||!product.data?.product?<div role="alert" className="manager-note">Не удалось открыть товар. <button type="button" onClick={()=>void product.refetch()}>Повторить</button></div>:<>
      <header className="manager-heading"><div><p className="dashboard-eyebrow">ТОВАРЫ 2.0</p><h1>{product.data.product.name}</h1><p>{product.data.product.isAvailable?'Товар в продаже':'Товар выключен из продажи'}</p></div><Link href={`/admin/products-v2/${id}/details`} className="manager-button"><Pencil size={17}/> Карточка товара</Link></header>
      <RecipeEditor key={id} ownerKind="PRODUCT" ownerId={id} readOnly={!hasPermission(user,'inventory_catalog')}/>
    </>}
  </div>;
}
