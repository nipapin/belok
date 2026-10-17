"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Plus, Pencil, Save, ArrowLeft, CheckCircle2 } from "lucide-react";

type Item = { id: string; label: string; type: "check" | "yesno" | "number" | "text"; required: boolean };
type Template = { id?: string; title: string; description: string; role: string; schedule: "daily" | "manual"; active: boolean; items: Item[] };
type Run = { id: string; template_id: string; actor_id: string; title: string; items: Item[]; answers: Record<string, string | boolean | number>; completed_at: string | null; work_date: string };
const roles: Record<string,string> = { MANAGER:"Управляющий", CASHIER:"Кассир", COOK:"Повар", STOCKKEEPER:"Кладовщик" };
const itemTypes: Record<Item["type"],string> = { check:"Галочка", yesno:"Да / нет", number:"Число", text:"Текст" };
const blank = (): Template => ({ title:"", description:"", role:"MANAGER", schedule:"daily", active:true, items:[{ id: crypto.randomUUID(), label:"", type:"check", required:true }] });

export default function ChecklistsPage() {
  const [templates,setTemplates] = useState<Template[]>([]);
  const [runs,setRuns] = useState<Run[]>([]);
  const [canEdit,setCanEdit] = useState(false);
  const [editing,setEditing] = useState<Template | null>(null);
  const [current,setCurrent] = useState<Run | null>(null);
  const [answers,setAnswers] = useState<Run["answers"]>({});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  async function api(body?: unknown) {
    const response = await fetch("/api/admin/checklists",body ? { method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify(body)} : {cache:"no-store"});
    const json = await response.json();
    if(!response.ok) throw new Error(json.error || "Ошибка запроса");
    return json;
  }
  async function reload() {
    const data = await api();
    setTemplates(data.templates);
    setRuns(data.runs);
    setCanEdit(data.canEdit);
  }
  useEffect(() => { void reload().catch(e=>setError(e.message)).finally(()=>setLoading(false)); },[]);
  async function act(body: unknown, afterward?: (value: any)=>void) {
    setBusy(true); setError("");
    try { const value = await api(body); afterward?.(value); await reload(); }
    catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function updateItem(index:number,patch:Partial<Item>) {
    if (!editing) return;
    setEditing({...editing,items:editing.items.map((item,i)=>i===index?{...item,...patch}:item)});
  }
  function openRun(run:Run) {setCurrent(run);setAnswers(run.answers || {});setEditing(null);}
  const panel = "rounded-2xl border border-gray-200 bg-white p-4 sm:p-6";
  const field = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400";
  return <div className="mx-auto max-w-5xl space-y-5 pb-24 text-gray-900">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">Чек-листы</h1><p className="mt-1 text-sm text-gray-500">Проверки заведения, шаблоны и журнал выполнения</p></div>
      {!editing && !current && canEdit && <button className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm text-white" onClick={()=>setEditing(blank())}><Plus size={17}/>Создать шаблон</button>}
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm text-gray-500">Загрузка…</p> : editing ? <section className={panel}>
      <button className="mb-5 flex items-center gap-2 text-sm text-gray-500" onClick={()=>setEditing(null)}><ArrowLeft size={16}/>Назад</button>
      <h2 className="mb-4 text-lg font-semibold">{editing.id?"Редактирование":"Новый чек-лист"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Название<input className={field} value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})} placeholder="Открытие кухни"/></label>
        <label className="space-y-1 text-sm">Ответственный по роли<select className={field} value={editing.role} onChange={e=>setEditing({...editing,role:e.target.value})}>{Object.entries(roles).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-1 text-sm sm:col-span-2">Описание<textarea className={field} rows={2} value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/></label>
        <label className="space-y-1 text-sm">Периодичность<select className={field} value={editing.schedule} onChange={e=>setEditing({...editing,schedule:e.target.value as Template["schedule"]})}><option value="daily">Ежедневно</option><option value="manual">По запросу</option></select></label>
        <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/>Активен</label>
      </div>
      <div className="mt-7 space-y-3">
        <h3 className="font-medium">Пункты ({editing.items.length})</h3>
        {editing.items.map((item,index)=><div key={item.id} className="rounded-xl border border-gray-200 p-3">
          <div className="flex items-start gap-2"><span className="pt-2 text-xs text-gray-400">{index+1}</span><input className={field} placeholder="Что нужно проверить?" value={item.label} onChange={e=>updateItem(index,{label:e.target.value})}/><button aria-label="Удалить пункт" className="p-2 text-gray-500" onClick={()=>setEditing({...editing,items:editing.items.filter((_,i)=>i!==index)})}>✕</button></div>
          <div className="mt-2 flex flex-wrap items-center gap-3 pl-5"><select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={item.type} onChange={e=>updateItem(index,{type:e.target.value as Item["type"]})}>{Object.entries(itemTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.required} onChange={e=>updateItem(index,{required:e.target.checked})}/>Обязательный</label><button disabled={index===0} className="text-xs text-gray-500 disabled:opacity-30" onClick={()=>setEditing({...editing,items:editing.items.map((x,i)=>i===index-1?item:i===index?editing.items[index-1]:x)})}>↑ Выше</button></div>
        </div>)}
        <button className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm" onClick={()=>setEditing({...editing,items:[...editing.items,{id:crypto.randomUUID(),label:"",type:"check",required:true}]})}><Plus size={16}/>Добавить пункт</button>
      </div>
      <div className="mt-6 flex justify-end"><button disabled={busy || !editing.title.trim() || !editing.items.length || editing.items.some(i=>!i.label.trim())} className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm text-white disabled:opacity-40" onClick={()=>void act({action:"saveTemplate",id:editing.id,template:editing},()=>setEditing(null))}><Save size={17}/>Сохранить</button></div>
    </section> : current ? <section className={panel}>
      <button className="mb-4 flex items-center gap-2 text-sm text-gray-500" onClick={()=>setCurrent(null)}><ArrowLeft size={16}/>К списку</button>
      <h2 className="text-xl font-semibold">{current.title}</h2><p className="mb-5 mt-1 text-sm text-gray-500">{current.work_date} {current.completed_at?"· Завершён":"· В процессе"}</p>
      <div className="space-y-5">{current.items.map((item,index)=><div key={item.id} className="space-y-2 border-b border-gray-100 pb-4"><label className="block text-sm font-medium">{index+1}. {item.label}{item.required?" *":""}</label>
        {item.type==="check" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!!current.completed_at} checked={answers[item.id]===true} onChange={e=>setAnswers({...answers,[item.id]:e.target.checked})}/>Выполнено</label>}
        {item.type==="yesno" && <select disabled={!!current.completed_at} className={field} value={answers[item.id]===undefined?"":String(answers[item.id])} onChange={e=>setAnswers({...answers,[item.id]:e.target.value==="true"})}><option value="">Выбрать ответ</option><option value="true">Да</option><option value="false">Нет</option></select>}
        {item.type==="number" && <input disabled={!!current.completed_at} type="number" step="any" className={field} value={answers[item.id]===undefined?"":String(answers[item.id])} onChange={e=>{const v=e.target.value;setAnswers(prev=>{const next={...prev};if(v==="")delete next[item.id];else next[item.id]=Number(v);return next;});}}/>}
        {item.type==="text" && <textarea disabled={!!current.completed_at} className={field} rows={2} value={String(answers[item.id]??"")} onChange={e=>setAnswers({...answers,[item.id]:e.target.value})}/>}
      </div>)}</div>
      {!current.completed_at && <div className="mt-6 flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl border border-gray-200 px-4 py-2 text-sm" onClick={()=>void act({action:"answer",runId:current.id,answers},({run})=>openRun(run))}>Сохранить черновик</button><button disabled={busy} className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white" onClick={()=>void act({action:"answer",runId:current.id,answers,complete:true},({run})=>openRun(run))}>Завершить проверку</button></div>}
    </section> : <>
      <div className="grid gap-3 sm:grid-cols-2">{templates.map(t=>{const run=runs.find(r=>r.template_id===t.id && r.work_date===new Date().toLocaleDateString("en-CA"));return <div key={t.id} className={panel}>
        <div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{t.title}</h2><p className="mt-1 text-xs text-gray-500">{roles[t.role]} · {t.schedule==="daily"?"Ежедневно":"По запросу"} · {t.items.length} пунктов</p></div>{canEdit && <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Редактировать" onClick={()=>setEditing({...t})}><Pencil size={17}/></button>}</div>
        <p className="mt-2 text-sm text-gray-500">{t.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">{!t.active?<span className="text-sm text-gray-400">Отключён</span>:<button disabled={busy} className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white" onClick={()=>void act({action:"start",templateId:t.id},({run})=>openRun(run))}>Открыть проверку</button>}{run?.completed_at&&<span className="flex items-center gap-1 text-sm text-green-700"><CheckCircle2 size={16}/>Выполнено</span>}</div>
      </div>})}</div>
      {!templates.length&&<div className={panel}><ClipboardCheck className="mb-3 text-gray-400"/><p className="font-medium">Пока нет доступных чек-листов</p><p className="mt-1 text-sm text-gray-500">Управляющий может создать первый шаблон.</p></div>}
      <section className={panel}><h2 className="mb-4 font-semibold">Журнал проверок</h2>{runs.length? <div className="divide-y divide-gray-100">{runs.map(run=><button key={run.id} className="flex w-full items-center justify-between gap-2 py-3 text-left text-sm" onClick={()=>openRun(run)}><span>{run.title}<span className="ml-2 text-xs text-gray-400">{run.work_date}</span></span><span className={run.completed_at?"text-green-700":"text-gray-500"}>{run.completed_at?"Завершён":"В работе"}</span></button>)}</div>:<p className="text-sm text-gray-500">Записей пока нет.</p>}</section>
    </>}
  </div>;
}
