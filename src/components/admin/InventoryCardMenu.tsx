'use client';
import {useEffect, useRef} from 'react';
import {History, ListTree, MoreHorizontal} from 'lucide-react';

export default function InventoryCardMenu({name,onAudit,onMovements,canAudit=true}:{name:string;canAudit?:boolean;onAudit:()=>void;onMovements:()=>void}) {
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))ref.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[]);
  const select=(action:()=>void)=>{if(ref.current)ref.current.open=false;action();};
  return <details ref={ref} className="inventory-card-menu">
    <summary aria-label={'Дополнительные действия: '+name} title="Дополнительные действия"><MoreHorizontal size={19}/></summary>
    <div className="inventory-card-menu-options">
      {canAudit&&<button type="button" onClick={()=>select(onAudit)}><History size={15}/>Аудит</button>}
      <button type="button" onClick={()=>select(onMovements)}><ListTree size={15}/>Движения</button>
    </div>
  </details>;
}
