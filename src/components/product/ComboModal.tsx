'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { X } from 'lucide-react';
import { ComboChoices,comboDisplay,comboSelectionValid,initialComboSelections } from '@/components/product/ComboChoices';
import type { ComboGroup,ComboSelection } from '@/lib/combos';
import { useCartStore } from '@/store/cartStore';
type Product={id:string;name:string;price:number;image:string|null;isAvailable:boolean;comboGroups:ComboGroup[]};
export default function ComboModal({productId,onClose}:{productId:string;onClose:()=>void}){
 const {data,isLoading}=useQuery({queryKey:['combo-product',productId],refetchInterval:10000,queryFn:async()=>{const r=await fetch('/api/products/'+productId,{cache:'no-store'});if(!r.ok)throw Error('Недоступно');return (await r.json()).product as Product|null}});
 const [picked,setPicked]=useState<{ownerId:string;choices:ComboSelection[]}|null>(null);
 const add=useCartStore(s=>s.addItem);
 const groups=data?.comboGroups??[];
 const choices=picked?.ownerId===productId?picked.choices:initialComboSelections(groups);
 const setChoices=(choices:ComboSelection[])=>setPicked({ownerId:productId,choices});
 const info=comboDisplay(groups,choices);
 const valid=comboSelectionValid(groups,choices);
 return <div className="fixed inset-0 z-[2000] flex items-end justify-center sm:items-center sm:p-6" role="presentation">
  <button className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Закрыть окно"/>
  <section role="dialog" aria-modal="true" aria-label="Настроить комбо" className="glass-panel-strong relative z-10 flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
   <header className="flex items-center justify-between border-b border-(--lg-ring) p-4"><strong>Состав комбо</strong><button onClick={onClose} aria-label="Закрыть"><X size={22}/></button></header>
   <div className="overflow-y-auto p-4">{isLoading?<p>Загружаем…</p>:!data?<p>Комбо недоступно</p>:<><h2 className="text-xl font-semibold">{data.name}</h2><ComboChoices groups={groups} value={choices} onChange={setChoices}/></>}</div>
   {data&&<footer className="border-t border-(--lg-ring) p-4"><button className="btn-primary min-h-12 w-full" disabled={!data.isAvailable||!valid} onClick={()=>{add({productId:data.id,name:data.name,image:data.image,basePrice:data.price+info.extra,quantity:1,customizations:[],comboSelections:choices,comboLabel:info.label});onClose()}}>Добавить в корзину · {data.price+info.extra} ₽</button></footer>}
  </section>
 </div>;
}
