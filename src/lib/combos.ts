import { query } from '@/lib/db';
export type ComboOption={productId:string;name:string;priceDelta:number;available:boolean};
export type ComboGroup={id:string;name:string;minSelect:number;maxSelect:number;options:ComboOption[]};
export type ComboSelection={groupId:string;productIds:string[]};
export type ComboSnapshot={groups:{name:string;products:{productId:string;name:string;quantity:number}[]}[]};
type Row={comboId:string;groupId:string;groupName:string;minSelect:number;maxSelect:number;productId:string|null;productName:string|null;priceDelta:string|null;available:boolean|null};
export async function loadComboGroups(ids:string[]):Promise<Record<string,ComboGroup[]>>{
 if(!ids.length)return {};
 const rows=await query<Row>(`SELECT g."comboId",g.id AS "groupId",g.name AS "groupName",g."minSelect",g."maxSelect",
  o."productId",p.name AS "productName",o."priceDelta"::text AS "priceDelta",
  (p."isAvailable" AND c."isActive") AS available
  FROM combo_groups g LEFT JOIN combo_group_options o ON o."groupId"=g.id
  LEFT JOIN products p ON p.id=o."productId" LEFT JOIN categories c ON c.id=p."categoryId"
  WHERE g."comboId"=ANY($1::text[]) ORDER BY g."sortOrder",g.id,o."sortOrder",o.id`,[ids]);
 const grouped:Record<string,ComboGroup[]>={};
 for(const row of rows){const groups=grouped[row.comboId]??(grouped[row.comboId]=[]);
 let group=groups.find(g=>g.id===row.groupId);
 if(!group){group={id:row.groupId,name:row.groupName,minSelect:row.minSelect,maxSelect:row.maxSelect,options:[]};groups.push(group)}
 if(row.productId&&row.productName)group.options.push({productId:row.productId,name:row.productName,priceDelta:Number(row.priceDelta),available:Boolean(row.available)});
 }
 return grouped;
}
export function validateCombo(groups:ComboGroup[], selections:unknown):{priceDelta:number;snapshot:ComboSnapshot}{
 if(!groups.length||!Array.isArray(selections))throw Error('COMBO_SELECTION');
 const entries=selections as ComboSelection[];
 if(entries.length!==groups.length||entries.some(e=>!e||typeof e.groupId!=='string'||!Array.isArray(e.productIds)))throw Error('COMBO_SELECTION');
 let priceDelta=0;const snapshot:ComboSnapshot={groups:[]};
 for(const group of groups){
  const entry=entries.find(e=>e.groupId===group.id);
  if(!entry)throw Error('COMBO_SELECTION');
  const ids=entry.productIds;
  if(ids.length<group.minSelect||ids.length>group.maxSelect||new Set(ids).size!==ids.length)throw Error('COMBO_SELECTION');
  const products=[];
  for(const id of ids){const option=group.options.find(o=>o.productId===id&&o.available);if(!option)throw Error('COMBO_SELECTION');
   priceDelta+=option.priceDelta;products.push({productId:id,name:option.name,quantity:1});
  }
  snapshot.groups.push({name:group.name,products});
 }
 return {priceDelta,snapshot};
}
