'use client';
import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {inventoryUnitLabels, stockMilli, stockNext, stockDecimal, stockReasonLabels, type InventoryUnit, type StockReason} from '@/lib/inventoryStock';

export type StockItemSummary = {id: string; name: string; kind: string; unit: InventoryUnit; quantity: string};
export default function StockOperationModal({item, reason, onClose, onSuccess}: {item: StockItemSummary; reason: StockReason; onClose: () => void; onSuccess: () => void}) {
  const [quantity, setQuantity] = useState(reason === 'RECOUNT' ? item.quantity : '');
  const [note, setNote] = useState('');
  const [operationId] = useState(() => crypto.randomUUID());
  const [expectedQuantity] = useState(item.quantity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLInputElement>('input')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
      }
    };
    document.addEventListener('keydown', key);
    return () => {document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus();};
  }, [busy, onClose]);
  let next: string | null = null;
  try {next = stockDecimal(stockNext(stockMilli(expectedQuantity,'g'), stockMilli(quantity,item.unit), reason));} catch { /* Form remains disabled. */ }
  async function submit() {
    if (busy || next === null || !note.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/inventory/operations', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId,itemId:item.id,reason,quantity:quantity.replace(',','.'),expectedQuantity:reason === 'RECOUNT' ? expectedQuantity : undefined,note})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Операция не проведена.');
      onSuccess();
    } catch (failure) {setError(failure instanceof TypeError ? 'Ответ не получен. Повторите отправку без изменения данных: повтор не изменит остаток второй раз.' : failure instanceof Error ? failure.message : 'Не удалось провести операцию.');}
    finally {setBusy(false);}
  }
  return createPortal(<div className="inventory-modal-root inventory-overlay-theme">
    <button type="button" className="inventory-modal-backdrop" aria-label="Закрыть операцию" disabled={busy} onClick={onClose}/>
    <form ref={panel} role="dialog" aria-modal="true" aria-labelledby="stock-operation-title" className="inventory-modal-panel" onClick={event => event.stopPropagation()} onSubmit={event => {event.preventDefault(); void submit();}}>
      <div className="flex items-center justify-between gap-3"><h2 id="stock-operation-title" className="text-lg font-semibold">{stockReasonLabels[reason]}</h2><button type="button" aria-label="Закрыть операцию" disabled={busy} onClick={onClose}><X size={20}/></button></div>
      <p className="mt-3 font-medium">{item.name}</p>
      <p className="mt-1 text-sm text-(--lg-text-muted)">Остаток перед операцией: {Number(expectedQuantity).toLocaleString('ru-RU',{maximumFractionDigits:3})} {inventoryUnitLabels[item.unit]}</p>
      <label className="mt-4 block text-sm">{reason === 'RECOUNT' ? 'Фактически на складе' : reason === 'WRITE_OFF' ? 'Сколько списать' : 'Сколько внести'}, {inventoryUnitLabels[item.unit]}
        <input aria-label="Количество операции" className="inventory-field mt-1" inputMode={item.unit === 'pcs' ? 'numeric' : 'decimal'} value={quantity} disabled={busy} onChange={event => setQuantity(event.target.value)} required/>
      </label>
      <p className="mt-1 text-xs text-(--lg-text-muted)">{item.unit === 'pcs' ? 'Только целые штуки.' : 'До 3 знаков после запятой. Количество вводится в ' + inventoryUnitLabels[item.unit] + '.'}</p>
      <label className="mt-4 block text-sm">{reason === 'RECEIPT' ? 'Поставка / документ / примечание' : 'Причина / примечание'}<textarea aria-label="Причина операции" className="inventory-field mt-1" maxLength={500} required value={note} disabled={busy} onChange={event => setNote(event.target.value)}/></label>
      {next !== null && <p className="mt-4 text-sm font-medium">После операции: {Number(next).toLocaleString('ru-RU',{maximumFractionDigits:3})} {inventoryUnitLabels[item.unit]}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <button type="submit" className="inventory-modal-submit mt-5 w-full" disabled={busy || next === null || !note.trim()}>{busy ? 'Проводим…' : 'Провести операцию'}</button>
    </form>
  </div>, document.body);
}
