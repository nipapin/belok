'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Loader2 } from 'lucide-react';

export default function TerminalPayPanel({orderId,onStatus,onDeferred}:{orderId:string;onStatus:(status:string)=>void;onDeferred:()=>void}) {
  const callback = useRef(onStatus);
  const deferredCallback = useRef(onDeferred);
  useEffect(()=>{callback.current=onStatus;deferredCallback.current=onDeferred},[onStatus,onDeferred]);
  const [cancellation,setCancellation]=useState<'CANCEL'|null>(null);
  const [error,setError]=useState('');
  const {data,isError}=useQuery({queryKey:['terminal-payment',orderId],queryFn:async()=>{
    const res=await fetch(`/api/kiosk/orders/${orderId}/payment`,{cache:'no-store'});
    if(!res.ok) throw new Error('Нет связи');
    return res.json() as Promise<{paymentStatus:string;terminalState:string;terminalMessage?:string;
      deferredState?:string|null;cancelIntent?:'CANCEL'|'DEFER'|null}>;
  },refetchInterval:q=>['SUCCEEDED','CANCELLED'].includes(q.state.data?.paymentStatus ?? '') ? false : 2000});
  useEffect(()=>{
    if (data?.paymentStatus === 'SUCCEEDED' || data?.paymentStatus === 'CANCELLED') callback.current(data.paymentStatus);
    else if (data?.deferredState === 'WAITING') deferredCallback.current();
  },[data?.paymentStatus,data?.deferredState]);
  async function cancel() {
    setCancellation('CANCEL');setError('');
    try {
      const response=await fetch(`/api/kiosk/orders/${orderId}/payment`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel'}),
      });
      if(!response.ok) throw new Error();
    } catch {setError('Не удалось завершить попытку оплаты. Обратитесь к сотруднику.');setCancellation(null)}
  }
  const intent = data?.cancelIntent ?? cancellation;
  const transferring = Boolean(data?.deferredState);
  const transferProblem = ['FAILED','UNKNOWN','BLOCKED'].includes(data?.deferredState ?? '');
  const uncertain = data?.terminalState === 'UNKNOWN' || isError;
  return <div className="glass-panel space-y-5 p-6 text-center">
    <CreditCard className="mx-auto size-20" />
    <h2 className="text-2xl font-semibold">{uncertain ? 'Уточняем результат оплаты' : transferring ? 'Оплата картой не завершилась' : intent === 'DEFER' ? 'Уточняем результат оплаты' : intent === 'CANCEL' ? 'Ожидаем отмену оплаты' : data?.paymentStatus==='CANCELLED' ? 'Оплата отменена' : data?.terminalState==='QUEUED' ? 'Готовим терминал…' : 'Приложите карту к терминалу'}</h2>
    <p className="text-(--lg-text-muted)">{transferring ? transferProblem ? 'Обратитесь к кассиру. Повторно оформлять заказ не нужно.' : 'Пожалуйста, подождите…' : intent === 'DEFER' ? 'Дождитесь результата оплаты на этом экране.' : data?.terminalMessage || (intent === 'CANCEL' ? 'Ожидаем подтверждение отмены. Платёж мог успеть пройти.' : 'Дождитесь результата оплаты на этом экране.')}</p>
    {data?.paymentStatus==='CANCELLED' ? <p>Оплата отменена. Бонусы возвращены.</p> : <Loader2 className="mx-auto size-8 animate-spin" />}
    {isError ? <p role="alert">Нет связи с сервером. Результат уточняется; не оплачивайте повторно.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {data?.paymentStatus==='PENDING' && !uncertain && !transferring && !intent ? <div className="space-y-3">
      <button type="button" className="btn-outline w-full" onClick={cancel}>Отменить оплату</button>
    </div> : null}
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
