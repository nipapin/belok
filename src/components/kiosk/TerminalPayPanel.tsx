'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Loader2 } from 'lucide-react';

export default function TerminalPayPanel({orderId,onStatus}:{orderId:string;onStatus:(status:string)=>void}) {
  const callback = useRef(onStatus);
  useEffect(()=>{callback.current=onStatus},[onStatus]);
  const [cancelling,setCancelling]=useState(false);
  const [error,setError]=useState('');
  const {data,isError}=useQuery({queryKey:['terminal-payment',orderId],queryFn:async()=>{
    const res=await fetch(`/api/kiosk/orders/${orderId}/payment`,{cache:'no-store'});
    if(!res.ok) throw new Error('Нет связи');
    return res.json() as Promise<{paymentStatus:string;terminalState:string;terminalMessage?:string}>;
  },refetchInterval:q=>['SUCCEEDED','CANCELLED'].includes(q.state.data?.paymentStatus ?? '') ? false : 2000});
  useEffect(()=>{if(data?.paymentStatus) callback.current(data.paymentStatus)},[data?.paymentStatus]);
  async function cancel() {
    setCancelling(true);setError('');
    try {
      const response=await fetch(`/api/kiosk/orders/${orderId}/payment`,{method:'POST'});
      if(!response.ok) throw new Error();
    } catch {setError('Не удалось запросить отмену. Обратитесь к сотруднику.');setCancelling(false)}
  }
  return <div className="glass-panel space-y-5 p-6 text-center">
    <CreditCard className="mx-auto size-20" />
    <h2 className="text-2xl font-semibold">{data?.terminalState==='UNKNOWN' || isError ? 'Уточняем результат оплаты' : data?.terminalState==='QUEUED' ? 'Готовим терминал…' : cancelling ? 'Ожидаем отмену оплаты' : data?.paymentStatus==='CANCELLED' ? 'Оплата отменена' : 'Приложите карту к терминалу'}</h2>
    <p className="text-(--lg-text-muted)">{data?.terminalMessage || (cancelling ? 'Ожидаем подтверждение отмены. Платёж мог успеть пройти.' : 'Дождитесь результата оплаты на этом экране.')}</p>
    {data?.paymentStatus==='CANCELLED' ? <p>Оплата отменена. Бонусы возвращены.</p> : <Loader2 className="mx-auto size-8 animate-spin" />}
    {isError ? <p role="alert">Нет связи с сервером. Результат уточняется; не оплачивайте повторно.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {data?.paymentStatus==='PENDING' && data.terminalState!=='UNKNOWN' ? <button type="button" className="btn-outline w-full" disabled={cancelling} onClick={cancel}>{cancelling ? 'Отменяем…' : 'Отменить оплату'}</button> : null}
  </div>;
}

export function KioskReceiptStatus({orderId}:{orderId:string}) {
  const {data}=useQuery({queryKey:['kiosk-receipt',orderId],queryFn:async()=>{
    const res=await fetch(`/api/kiosk/orders/${orderId}/payment`,{cache:'no-store'});
    if(!res.ok) throw new Error();
    return res.json() as Promise<{receiptState:string|null}>;
  },refetchInterval:q=>q.state.data?.receiptState==='SUCCEEDED' ? false : 2000});
  return <p className="mt-4 text-base text-(--lg-text-muted)">{data?.receiptState==='SUCCEEDED' ? 'Заберите чек на терминале.' : ['FAILED','UNKNOWN','BLOCKED'].includes(data?.receiptState ?? '') ? 'Оплата прошла. Для получения чека обратитесь к сотруднику.' : 'Оплата прошла. Готовим чек на терминале…'}</p>;
}
