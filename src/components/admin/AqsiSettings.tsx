'use client';
import { useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';

interface Config { enabled:boolean;deviceId:number;receiptsEnabled:boolean;catalogEnabled:boolean;taxSystemCode:number;taxRateId:number|null;calculationTypeId:number|null;calculationSubjectId:number;cashierName:string }
interface Job {id:string;orderId:string;dailyNumber:number;kind:string;state:string;operationId:string|null;error:string|null}
interface Info {config:Config;keyConfigured:boolean;jobs:Job[];catalog:{phase:string;revision:string;syncedRevision:string;error:string|null}|null}
const stateLabels:Record<string,string>={QUEUED:'В очереди',SUBMITTING:'Отправляем',PROCESSING:'Выполняется',SUCCEEDED:'Готово',FAILED:'Ошибка',UNKNOWN:'Требуется сверка',BLOCKED:'Ожидает настройки'};
export default function AqsiSettings() {
  const client=useQueryClient();
  const [draft,setDraft]=useState<Config|null>(null);
  const [message,setMessage]=useState('');
  const [operations,setOperations]=useState<Record<string,string>>({});
  const {data,isError}=useQuery({queryKey:['admin-aqsi'],queryFn:async()=>{
    const response=await fetch('/api/admin/aqsi');if(!response.ok)throw new Error();return response.json() as Promise<Info>;
  },refetchInterval:5000});
  const mutation=useMutation({mutationFn:async({method,body}:{method:string;body:unknown})=>{
    const response=await fetch('/api/admin/aqsi',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const json=await response.json();if(!response.ok)throw new Error(json.error);return json;
  },onSuccess:(result,variables)=>{
    if(variables.method==='PUT') {
      setMessage('Настройки сохранены.');
      setDraft(current=>current && JSON.stringify(current)!==JSON.stringify(variables.body) ? current : null);
      client.setQueryData<Info>(['admin-aqsi'],current=>current ? {...current,config:result.config} : current);
    } else setMessage('Действие выполнено. Статусы обновятся автоматически.');
    void client.invalidateQueries({queryKey:['admin-aqsi']});
  },onError:(error)=>setMessage(error.message)});
  const config=draft ?? data?.config;
  function change<K extends keyof Config>(key:K,value:Config[K]) {if(config)setDraft({...config,[key]:value})}
  return <section className="glass-panel mt-8 space-y-4 p-5">
    <h2 className="text-xl font-semibold">Касса aQsi</h2>
    {isError ? <p>Не удалось загрузить настройки. Проверьте миграции базы данных.</p> : null}
    {!config ? <p>Загрузка…</p> : <>
      <p className="text-sm text-(--lg-text-muted)">API-ключ: {data?.keyConfigured ? 'настроен на сервере' : 'нужно добавить AQSI_API_KEY на сервере'}. Налоговые параметры ниже применяются ко всем товарам сайта.</p>
      <label className="block">ID кассы<input className="input-pill mt-1" type="number" value={config.deviceId || ''} onChange={e=>change('deviceId',Number(e.target.value))}/></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>Система налогообложения<select className="input-pill mt-1" value={config.taxSystemCode} onChange={e=>change('taxSystemCode',Number(e.target.value))}><option value="0">Выберите СНО</option>{[[1,'ОСН'],[2,'УСН доход'],[4,'УСН доход − расход'],[16,'ЕСХН'],[32,'Патент']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>НДС<select className="input-pill mt-1" value={config.taxRateId ?? ''} onChange={e=>change('taxRateId',e.target.value ? Number(e.target.value) : null)}><option value="">Выберите ставку</option>{[[6,'Без НДС'],[1,'22%'],[2,'10%'],[5,'0%'],[7,'5%'],[8,'7%'],[3,'22/122'],[4,'10/110'],[9,'5/105'],[10,'7/107']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Признак расчёта<select className="input-pill mt-1" value={config.calculationTypeId ?? ''} onChange={e=>change('calculationTypeId',e.target.value ? Number(e.target.value) : null)}><option value="">Выберите</option><option value="4">Полный расчёт</option></select></label>
        <label>Кассир (должность и фамилия)<input className="input-pill mt-1" value={config.cashierName} placeholder="Или активный кассир терминала" onChange={e=>change('cashierName',e.target.value)}/></label>
      </div>
      {(['enabled','receiptsEnabled','catalogEnabled'] as const).map((key,i)=><label key={key} className="flex items-center gap-3"><input type="checkbox" checked={config[key]} onChange={e=>change(key,e.target.checked)}/>{['Включить интеграцию aQsi','Печатать чеки после оплаты картой и СБП','Синхронизировать товары сайта с aQsi'][i]}</label>)}
      <p className="text-sm text-(--lg-text-muted)">Перед включением чеков убедитесь, что другая касса не формирует чек на ту же оплату. Сейчас поддерживается полный расчёт; для предоплаты потребуется дополнительный чек при выдаче.</p>
      <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={mutation.isPending} onClick={()=>mutation.mutate({method:'PUT',body:config})}>Сохранить aQsi</button><button className="btn-outline" disabled={mutation.isPending} onClick={()=>mutation.mutate({method:'POST',body:{action:'sync'}})}>Синхронизировать каталог</button><button className="btn-outline" disabled={mutation.isPending} onClick={()=>mutation.mutate({method:'POST',body:{action:'process'}})}>Проверить операции</button></div>
      {draft ? <p role="status" className="text-sm">Есть несохранённые настройки. Проверка операций использует сохранённые настройки. Перед повторной отправкой чека нажмите «Сохранить aQsi».</p> : null}
    </>}
    {message ? <p role="status">{message}</p> : null}
    {data?.catalog ? <p className="text-sm">Каталог: {data.catalog.phase==='IDLE' && String(data.catalog.revision)===String(data.catalog.syncedRevision) ? 'Синхронизирован с aQsi' : 'Ожидает синхронизации'} {data.catalog.error}</p> : null}
    <p className="text-sm text-(--lg-text-muted)">Для обработки при закрытом киоске на сервере должен работать сервис aQsi. После изменения настроек обновите страницу киоска.</p>
    <div className="space-y-3">{data?.jobs.map(job=><div key={job.id} className="rounded-xl border p-3 text-sm">
      <p>Заказ #{job.dailyNumber} · {job.kind==='CARD' ? 'Карта' : 'Чек'} · {stateLabels[job.state] ?? job.state}</p>
      {job.operationId ? <p className="break-all text-xs">Операция aQsi: {job.operationId}</p> : null}
      {job.error ? <p>{job.error}</p> : null}
      {job.state==='UNKNOWN' ? <div className="mt-2 space-y-2"><p>Проверьте историю aQsi. Укажите ID соответствующей операции для сверки. Повторно оплачивать заказ нельзя.</p><input className="input-pill" placeholder="ID операции aQsi" value={operations[job.id] ?? ''} onChange={e=>setOperations({...operations,[job.id]:e.target.value})}/><button className="btn-outline" disabled={mutation.isPending} onClick={()=>mutation.mutate({method:'POST',body:{action:'reconcile',jobId:job.id,operationId:operations[job.id]}})}>Сверить операцию</button></div> : null}
      {job.kind==='RECEIPT' && job.state==='FAILED' ? <div className="mt-2"><p>Проверьте историю кассы: повторная отправка допустима только если фискальный чек не создан.</p><button className="btn-outline mt-2" disabled={mutation.isPending || Boolean(draft)} onClick={()=>mutation.mutate({method:'POST',body:{action:'retryReceipt',jobId:job.id}})}>Чек не создан — отправить повторно</button></div> : null}
    </div>)}</div>
  </section>;
}
