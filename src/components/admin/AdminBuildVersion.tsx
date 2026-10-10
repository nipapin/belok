'use client';
import { useQuery } from '@tanstack/react-query';
import { buildVersion } from '@/lib/buildVersion';

export default function AdminBuildVersion() {
  const {data,isError}=useQuery({queryKey:['admin-build-version'],queryFn:async()=>{
    const response=await fetch('/api/admin/version',{cache:'no-store'});
    if(!response.ok)throw new Error('Не удалось проверить версию');
    return response.json() as Promise<typeof buildVersion>;
  },refetchInterval:5000});
  const outdated=Boolean(data && (data.revision!==buildVersion.revision || data.builtAt!==buildVersion.builtAt));
  return <div className="mb-4 rounded-xl border px-3 py-2 text-xs" data-admin-build-version>
    <p>Админка: <strong>{buildVersion.revision.slice(0,7)}</strong> · Сервер: <strong>{data?.revision.slice(0,7) ?? (isError ? 'недоступен' : 'проверяем…')}</strong>
      {buildVersion.builtAt ? <> · Собрано: {new Date(buildVersion.builtAt).toLocaleString('ru-RU',{timeZone:'Europe/Kaliningrad'})} (Калининград)</> : null}</p>
    {outdated ? <div role="status" className="mt-2 flex flex-wrap items-center gap-2"><p>На сервере другая сборка. Сохраните изменения и обновите админку.</p><button type="button" className="btn-outline" onClick={()=>window.location.reload()}>Обновить админку</button></div> : data ? <p className="mt-1">Админка и сервер одной версии.</p> : null}
  </div>;
}
