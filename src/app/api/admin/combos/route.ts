import { NextRequest,NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/adminAuth';
import { query,withTransaction } from '@/lib/db';
import { loadComboGroups } from '@/lib/combos';
export const dynamic='force-dynamic';
const fail=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function GET(request:NextRequest){
 try{await requireAdmin();const id=new URL(request.url).searchParams.get('productId');if(!id)return fail('Укажите товар');
 const combos=await loadComboGroups([id]);return NextResponse.json({groups:combos[id]??[]});}
 catch(e){if((e as Error).message==='UNAUTHORIZED')return fail('Нет доступа',403);console.error(e);return fail('Ошибка сервера',500)}
}
type InputGroup={name:string;minSelect:number;maxSelect:number;options:{productId:string;priceDelta:number}[]};
export async function PUT(request:NextRequest){
 try{
  await requireAdmin();const body=await request.json() as {productId?:string;groups?:InputGroup[]};
  if(!body?.productId||!Array.isArray(body.groups)||!body.groups.length||body.groups.length>12)return fail('Добавьте группы комбо');
  for(const group of body.groups){
   if(!group.name?.trim()||group.name.length>100||!Number.isInteger(group.minSelect)||!Number.isInteger(group.maxSelect)||group.minSelect<1||group.maxSelect>10||group.minSelect>group.maxSelect||!Array.isArray(group.options)||group.options.length<group.maxSelect||group.options.length>30||new Set(group.options.map(o=>o.productId)).size!==group.options.length||
   group.options.some(o=>!o.productId||!Number.isFinite(o.priceDelta)||o.priceDelta<0||Math.round(o.priceDelta*100)!==o.priceDelta*100))return fail('Проверьте группы выбора');
  }
  const selected=[...new Set(body.groups.flatMap(g=>g.options.map(o=>o.productId)))];
  if(selected.includes(body.productId))return fail('Комбо не может содержать себя');
  const rows=await query<{id:string;isCombo:boolean}>(`SELECT id,"isCombo" FROM products WHERE id=ANY($1::text[])`,[[body.productId,...selected]]);
  if(!rows.some(p=>p.id===body.productId&&p.isCombo)||selected.some(id=>!rows.some(p=>p.id===id&&!p.isCombo)))return fail('Выберите существующие обычные товары');
  const validGroups=body.groups;
  await withTransaction(async client=>{
   await client.query('DELETE FROM combo_groups WHERE "comboId"=$1',[body.productId]);
   for(const [order,group] of validGroups.entries()){
    const groupId=randomUUID();
    await client.query(`INSERT INTO combo_groups(id,"comboId",name,"minSelect","maxSelect","sortOrder") VALUES($1,$2,$3,$4,$5,$6)`,[groupId,body.productId,group.name.trim(),group.minSelect,group.maxSelect,order]);
    for(const [index,option] of group.options.entries()){
     await client.query(`INSERT INTO combo_group_options(id,"groupId","productId","priceDelta","sortOrder") VALUES($1,$2,$3,$4,$5)`,[randomUUID(),groupId,option.productId,option.priceDelta,index]);
    }
   }
  });
  return NextResponse.json({success:true});
 }catch(e){if((e as Error).message==='UNAUTHORIZED')return fail('Нет доступа',403);console.error('Combos save',e);return fail('Ошибка сохранения комбо',500)}
}
