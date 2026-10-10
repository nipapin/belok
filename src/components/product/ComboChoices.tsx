'use client';
import type { ComboGroup,ComboSelection } from '@/lib/combos';
export function initialComboSelections(groups:ComboGroup[]):ComboSelection[]{return groups.map(g=>({groupId:g.id,productIds:g.options.filter(o=>o.available).slice(0,g.minSelect).map(o=>o.productId)}));}
export function ComboChoices({groups,value,onChange}:{groups:ComboGroup[];value:ComboSelection[];onChange:(v:ComboSelection[])=>void}){
 return <div className="space-y-4 my-4">{groups.map(g=>{const picked=value.find(v=>v.groupId===g.id)?.productIds??[];return <fieldset className="rounded-xl border border-(--lg-ring) p-3" key={g.id}><legend className="px-1 font-semibold text-sm">{g.name} · {g.minSelect===g.maxSelect? `выбрать ${g.minSelect}`:`${g.minSelect}–${g.maxSelect}`}</legend><div className="space-y-2">{g.options.map(o=><label key={o.productId} className={`flex items-center gap-3 rounded-lg p-2 text-sm ${!o.available?'opacity-50':''}`}><input type={g.maxSelect===1?'radio':'checkbox'} name={g.id} checked={picked.includes(o.productId)} disabled={!o.available} onChange={()=>{let next:string[];if(g.maxSelect===1)next=[o.productId];else if(picked.includes(o.productId))next=picked.filter(x=>x!==o.productId);else next=picked.length<g.maxSelect?[...picked,o.productId]:picked;onChange(value.map(v=>v.groupId===g.id?{...v,productIds:next}:v));}}/><span className="flex-1">{o.name}</span>{o.priceDelta>0&&<span>+{o.priceDelta} ₽</span>}</label>)}</div></fieldset>})}</div>;
}
export function comboSelectionValid(groups:ComboGroup[], selections:ComboSelection[]){
 return groups.length>0&&groups.every(g=>{const ids=selections.find(s=>s.groupId===g.id)?.productIds??[];return ids.length>=g.minSelect&&ids.length<=g.maxSelect&&ids.every(id=>g.options.some(o=>o.productId===id&&o.available));});
}
export function comboDisplay(groups:ComboGroup[], selections:ComboSelection[]){
 const names:string[]=[];let extra=0;
 for(const group of groups){for(const id of selections.find(s=>s.groupId===group.id)?.productIds??[]){const option=group.options.find(o=>o.productId===id);if(option){names.push(option.name);extra+=option.priceDelta}}}
 return {label:names.join(' · '),extra};
}
