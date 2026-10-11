'use client';
import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {inventoryUnitLabels, stockReasonLabels, type InventoryUnit, type StockReason} from '@/lib/inventoryStock';
type Movement = {id: string; reason: string; delta: string; quantityAfter: string; note: string; createdAt: string; actorName: string | null; unit: InventoryUnit};
const labels: Record<string,string> = {...stockReasonLabels,PRODUCTION_INPUT:'Компоненты партии',PRODUCTION_OUTPUT:'Выпуск заготовки',SALE:'Продажа'};
export default function StockMovements({itemId,itemName,onClose}: {itemId: string; itemName: string; onClose: () => void}) {
  const [movements,setMovements] = useState<Movement[]>([]);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch('/api/admin/inventory/operations?itemId=' + encodeURIComponent(itemId),{cache:'no-store'}).then(async response => {const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;}).then(data => {if (active) setMovements(data.movements);}).catch(failure => {if (active) setError(failure.message);}).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  },[itemId]);
  useEffect(() => {const overflow=document.body.style.overflow;document.body.style.overflow='hidden';const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);};},[onClose]);
  return createPortal(<div className="inventory-drawer-root inventory-overlay-theme" data-visible="true">
    <button type="button" className="inventory-drawer-backdrop" aria-label="Закрыть движения" onClick={onClose}/>
    <section role="dialog" aria-modal="true" aria-label={'Движения: ' + itemName} className="inventory-drawer-panel">
      <div className="inventory-drawer-header"><h2 className="text-lg font-semibold">Движения: {itemName}</h2><button type="button" className="inventory-drawer-close" aria-label="Закрыть" onClick={onClose}><X size={18}/></button></div>
      <p className="mb-3 text-xs text-(--lg-text-muted)">Последние 100 движений</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {loading ? <p>Загрузка…</p> : <div className="inventory-drawer-content space-y-3">{!movements.length && !error && <p className="text-sm">Движений пока нет.</p>}{movements.map(movement => <article key={movement.id} className="rounded-xl border border-[#dce4df] bg-white p-3 text-sm">
        <div className="flex justify-between gap-3"><strong>{labels[movement.reason as StockReason] || movement.reason}</strong><span className={Number(movement.delta)<0 ? 'text-red-700' : 'text-emerald-700'}>{Number(movement.delta)>0 ? '+' : ''}{Number(movement.delta).toLocaleString('ru-RU',{maximumFractionDigits:3})} {inventoryUnitLabels[movement.unit]}</span></div>
        <p className="mt-1">Остаток: {Number(movement.quantityAfter).toLocaleString('ru-RU',{maximumFractionDigits:3})} {inventoryUnitLabels[movement.unit]}</p>
        <p className="mt-2 whitespace-pre-wrap break-words">{movement.note}</p>
        <p className="mt-2 text-xs text-(--lg-text-muted)">{movement.actorName || 'Система / ранее без автора'} · {new Date(movement.createdAt).toLocaleString('ru-RU',{timeZone:'Europe/Kaliningrad'})}</p>
      </article>)}</div>}
    </section>
  </div>,document.body);
}
