'use client';
import { useQuery } from '@tanstack/react-query';
import { roleLabels } from '@/lib/roles';
type Entry = {actorName:string|null;targetName:string|null;value:{actorId:string;targetId:string;action:string;createdAt:string;details:{before:string[]|string|null;after:string[]|string|null}}};
function labels(value:string[]|string|null) {return value === null ? 'Исходный доступ' : (Array.isArray(value)?value:[value]).map(role=>roleLabels[role]??role).join(', ')}
export default function StaffAuditPage() {
 const {data,isPending,isError}=useQuery({queryKey:['staff-audit'],queryFn:async()=>{const r=await fetch('/api/admin/staff-audit',{cache:'no-store'});if(!r.ok)throw Error('Не удалось загрузить журнал');return await r.json() as {entries:Entry[]}}});
 return <div><h1 className="heading-section mb-2">Журнал доступа</h1><p className="mb-6 text-sm text-(--lg-text-muted)">Кто и когда изменил роли сотрудников. Последние 200 записей.</p>
 {isPending&&<p>Загружаем…</p>}{isError&&<p role="alert">Не удалось загрузить журнал.</p>}
 <div className="space-y-3">{data?.entries.map((entry,i)=><article key={i} className="glass-panel p-4"><p className="text-sm">{new Date(entry.value.createdAt).toLocaleString('ru-RU')} · {entry.actorName??entry.value.actorId}</p><p className="mt-2 font-medium">{entry.targetName??entry.value.targetId}</p><p className="mt-1 text-sm">{labels(entry.value.details.before)} → {labels(entry.value.details.after)}</p></article>)}</div>
 {data&&!data.entries.length&&<p>Роли сотрудников ещё не менялись.</p>}</div>
}
