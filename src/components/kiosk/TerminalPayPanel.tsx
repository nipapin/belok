'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, Loader2 } from 'lucide-react';

// This is a UI escalation timeout, NOT a terminal/bank cancellation.
const CARD_WAIT_ESCALATE_MS = 180_000;
const CANCEL_WAIT_ESCALATE_MS = 45_000;

interface TerminalPaymentState {
  paymentStatus: string;
  terminalState: string | null;
  terminalMessage?: string | null;
  terminalStartedAt?: string | null;
  cancelRequestedAt?: string | null;
  deferredState?: string | null;
  cancelIntent?: 'CANCEL' | 'DEFER' | null;
}

export default function TerminalPayPanel({orderId,onStatus,onDeferred}:{orderId:string;onStatus:(status:string)=>void;onDeferred:()=>void}) {
  const callback = useRef(onStatus);
  const deferredCallback = useRef(onDeferred);
  useEffect(()=>{callback.current=onStatus;deferredCallback.current=onDeferred},[onStatus,onDeferred]);
  const [cancellation,setCancellation]=useState<'CANCEL'|null>(null);
  const [error,setError]=useState('');
  const [now,setNow]=useState(0);
  useEffect(()=>{
    setNow(Date.now());
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return ()=>window.clearInterval(timer);
  },[]);
  const {data,isError,dataUpdatedAt}=useQuery({
    queryKey:['terminal-payment',orderId],
    queryFn:async()=>{
      const res=await fetch(`/api/kiosk/orders/${orderId}/payment`,{cache:'no-store'});
      if(!res.ok) throw new Error('Нет связи');
      return res.json() as Promise<TerminalPaymentState>;
    },
    refetchInterval:q=>['SUCCEEDED','CANCELLED'].includes(q.state.data?.paymentStatus ?? '') ? false : 2000,
  });
  useEffect(()=>{
    if (data?.paymentStatus === 'SUCCEEDED' || data?.paymentStatus === 'CANCELLED') callback.current(data.paymentStatus);
    else if (data?.deferredState === 'WAITING') deferredCallback.current();
  },[data?.paymentStatus,data?.deferredState]);

  async function cancel() {
    if(cancellation) return;
    setCancellation('CANCEL');setError('');
    try {
      const response=await fetch(`/api/kiosk/orders/${orderId}/payment`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel'}),
      });
      if(!response.ok) throw new Error();
    } catch {
      setError('Нет подтверждения запроса отмены. Не повторяйте оплату; обратитесь к сотруднику.');
      // Do not resend a possibly accepted cancellation POST.
    }
  }

  const intent = data?.cancelIntent ?? cancellation;
  const transferring = Boolean(data?.deferredState);
  const transferProblem = ['FAILED','UNKNOWN','BLOCKED'].includes(data?.deferredState ?? '');
  const stale = isError || (now > 0 && dataUpdatedAt > 0 && now-dataUpdatedAt>20_000);
  const uncertain = data?.terminalState === 'UNKNOWN' || stale;
  const started = data?.terminalStartedAt ? Date.parse(data.terminalStartedAt) : NaN;
  const cancelStarted = data?.cancelRequestedAt ? Date.parse(data.cancelRequestedAt) : NaN;
  const escalated = Boolean(
    uncertain || error ||
    (now>0 && !transferring && data?.paymentStatus==='PENDING' &&
      (intent === 'CANCEL'
        ? Number.isFinite(cancelStarted) && now-cancelStarted>=CANCEL_WAIT_ESCALATE_MS
        : Number.isFinite(started) && now-started>=CARD_WAIT_ESCALATE_MS))
  );
  const title = escalated ? 'Нужна помощь сотрудника'
    : transferring ? 'Оплата картой не завершилась'
    : intent === 'DEFER' ? 'Уточняем результат оплаты'
    : intent === 'CANCEL' ? 'Ожидаем подтверждение отмены'
    : data?.paymentStatus==='CANCELLED' ? 'Оплата отменена'
    : data?.terminalState==='QUEUED' ? 'Готовим терминал…'
    : 'Приложите карту к терминалу';

  return <div className="glass-panel space-y-5 p-6 text-center">
    {escalated ? <AlertTriangle className="mx-auto size-16 text-amber-500"/> : <CreditCard className="mx-auto size-20" />}
    <h2 className="text-2xl font-semibold">{title}</h2>
    <p className="text-(--lg-text-muted)">
      {escalated
        ? 'Результат операции не подтверждён. Позовите сотрудника. Не прикладывайте карту повторно и не оформляйте новый заказ.'
        : transferring
          ? transferProblem ? 'Обратитесь к кассиру. Повторно оформлять заказ не нужно.' : 'Пожалуйста, подождите…'
          : data?.terminalMessage || (intent ? 'Ожидаем ответ aQsi. Запрос отмены не гарантирует отсутствие списания.' : 'Дождитесь результата оплаты на этом экране.')}
    </p>
    {data?.paymentStatus==='CANCELLED' ? <p>Оплата отменена. Бонусы возвращены.</p>
      : !escalated ? <Loader2 className="mx-auto size-8 animate-spin" /> : null}
    {escalated ? <div role="alert" className="space-y-2 rounded-xl border border-amber-500/30 p-4 text-left text-sm">
      <p className="font-medium">Для сотрудника</p>
      <p>Проверьте этот заказ и списание в aQsi → история операций. Если списания нет, выполните сверку в Админка → aQsi. Только после подтверждения статус изменится и киоск можно будет освободить.</p>
      <p>Если гость оплатил наличными на кассе, отметьте это при сверке: повторная продажа не создаётся.</p>
    </div> : null}
    {stale ? <p role="alert">Нет актуального ответа сервера. Статус банковской операции неизвестен.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {data?.paymentStatus==='PENDING' && !transferring && !intent && !stale ? <div className="space-y-3">
      <button type="button" className="btn-outline w-full" onClick={cancel}>Запросить отмену оплаты</button>
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
