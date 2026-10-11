'use client';
import {hasPermission} from '@/lib/roles';
import {useAuthStore} from '@/store/authStore';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {History,ShieldCheck,X} from 'lucide-react';
import AdminSelect from '@/components/admin/AdminSelect';
type Event={id:number;action:string;at:string;actorName:string|null;actorEmail:string|null;before:Record<string,unknown>|null;after:Record<string,unknown>|null};
type User={id:string;email:string;name:string|null;role:string|null};
const roles=[{value:'SUPERADMIN',label:'Суперадмин'},{value:'MANAGER',label:'Управляющий'},{value:'STOCK',label:'Склад'},{value:'VIEWER',label:'Просмотр'}];
const fields:{key:string;label:string}[]=[{key:'name',label:'Название'},{key:'quantity',label:'Остаток'},{key:'min_quantity',label:'Минимум'},{key:'kind',label:'Тип'},{key:'unit',label:'Единица'},{key:'image',label:'Фото'},{key:'reason',label:'Причина'},{key:'delta',label:'Изменение'}];
export default function InventoryAdministration({itemId,itemName,onClose}:{itemId?:string;itemName?:string;onClose:()=>void}){
 const user=useAuthStore(s=>s.user);
 const canAccess=hasPermission(user,'inventory_access');
 const [tab,setTab]=useState<'history'|'access'>('history');
 const [mounted,setMounted]=useState(false);
 const [visible,setVisible]=useState(false);
 useEffect(()=>{setMounted(true);const frame=requestAnimationFrame(()=>setVisible(true));return()=>cancelAnimationFrame(frame)},[]);
 useEffect(()=>{const prev=document.body.style.overflow;document.body.style.overflow='hidden';const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=prev;document.removeEventListener('keydown',key)}},[onClose]);
 const [events,setEvents]=useState<Event[]>([]);
 const [users,setUsers]=useState<User[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;setLoading(true);setError('');const url=tab==='history'?'/api/admin/inventory/audit'+(itemId?'?itemId='+encodeURIComponent(itemId):''):'/api/admin/inventory/access';
 fetch(url).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error??'Не удалось загрузить');return data}).then(data=>{if(!live)return;if(tab==='history')setEvents(data.events??[]);else setUsers(data.users??[])}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[tab,itemId]);
 const update=async(userId:string,role:string)=>{setBusy(true);setError('');try{const r=await fetch('/api/admin/inventory/access',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,role})});const d=await r.json();if(!r.ok)throw Error(d.error??'Не удалось сохранить');setUsers(v=>v.map(u=>u.id===userId?{...u,role}:u))}catch(e){setError(e instanceof Error?e.message:'Ошибка')}finally{setBusy(false)}};
 if(!mounted)return null;
 return createPortal(<div className="inventory-drawer-root inventory-overlay-theme" data-visible={visible}>
  <button type="button" className="inventory-drawer-backdrop" aria-label="Закрыть панель" onClick={onClose}/>
  <section role="dialog" aria-modal="true" aria-label={itemId?'История позиции':'Управление складом'} className="inventory-drawer-panel">
  <div className="inventory-drawer-header"><h2 className="font-semibold text-lg text-[#202b28]">{itemId?'История: '+itemName:'Управление складом'}</h2><button type="button" className="inventory-drawer-close" aria-label="Закрыть" onClick={onClose}><X size={17}/></button></div>
  {!itemId&&<div className="inventory-drawer-tabs">
   <button type="button" className={tab==='history'?'inventory-drawer-tab inventory-drawer-tab-active':'inventory-drawer-tab'} onClick={()=>setTab('history')}><History size={15} className="inline mr-1"/>История</button>
   {canAccess&&<button type="button" className={tab==='access'?'inventory-drawer-tab inventory-drawer-tab-active':'inventory-drawer-tab'} onClick={()=>setTab('access')}><ShieldCheck size={15} className="inline mr-1"/>Доступы</button>}
  </div>}
  {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
  {loading?<p className="text-sm text-(--lg-text-muted)">Загрузка…</p>:tab==='history'||itemId?
  <div className="inventory-drawer-content space-y-2">
   {!events.length&&<p className="text-sm text-(--lg-text-muted)">Записей пока нет.</p>}
   {events.map(ev=>{const changes=fields.filter(f=>String(ev.before?.[f.key]??'')!==String(ev.after?.[f.key]??'') && (ev.before?.[f.key]!==undefined||ev.after?.[f.key]!==undefined));
    return <div key={ev.id} className="rounded-xl border border-[#dce4df] bg-white p-3 space-y-1 text-[#202b28]">
      <div className="flex justify-between items-start gap-2"><strong className="text-sm">{ev.action==='INSERT'?'Создание':ev.action==='DELETE'?'Удаление':ev.action==='MOVEMENT'?'Движение склада':'Изменение'}</strong><time className="text-xs text-(--lg-text-muted)" dateTime={ev.at}>{new Date(ev.at).toLocaleString('ru-RU')}</time></div>
      <p className="text-xs text-(--lg-text-muted)">{ev.actorName||ev.actorEmail||'Система / без автора'}</p>
      {changes.slice(0,8).map(f=><p key={f.key} className="text-xs break-words">{f.label}: {String(ev.before?.[f.key]??'—')} → {String(ev.after?.[f.key]??'—')}</p>)}
    </div>})}
  </div>:
  <div className="inventory-drawer-content space-y-2">
   {users.map(u=><div className="flex items-center justify-between gap-3 border-b border-(--lg-ring) py-2" key={u.id}>
    <div className="min-w-0"><p className="text-sm font-medium truncate">{u.name||u.email}</p><p className="text-xs text-(--lg-text-muted) truncate">{u.email}</p></div>
    <div className="w-[170px] shrink-0"><AdminSelect ariaLabel={'Права '+u.email} value={u.role??'MANAGER'} onChange={v=>{if(!busy)void update(u.id,v)}} options={roles}/></div>
   </div>)}
  </div>}
  </section>
 </div>,document.body);
}
