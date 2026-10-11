import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '@/lib/db';
import {requireInventoryPermission} from '@/lib/inventoryAccess';
import {inventoryKinds, stockMilli, stockDecimal, type InventoryUnit} from '@/lib/inventoryStock';

export const dynamic = 'force-dynamic';
const validImage = (v: unknown) => v === null || (typeof v === 'string' && v.length <= 2048 && (v === '' || v.startsWith('/uploads/') || /^https:\/\//.test(v)));
const units = ['g', 'ml', 'pcs'] as const;
const kinds = inventoryKinds;
const validQuantity = (value: unknown, unit: InventoryUnit = 'g') => {
  try { stockMilli(value, unit); return true; } catch { return false; }
};
const errorResponse = (error: unknown) => {
  if (['UNAUTHORIZED','FORBIDDEN'].includes((error as Error).message)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'Такая позиция уже существует' }, { status: 409 });
  console.error('Inventory API:', error);
  return NextResponse.json({ error: 'Ошибка склада. Проверьте, что миграция применена.' }, { status: 500 });
};
export async function GET() {
  try {
    await requireInventoryPermission('view');
    const items = await query(`SELECT id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",image,notes,updated_at AS "updatedAt",is_active AS "isActive" FROM inventory_items ORDER BY name COLLATE "default"`);
    return NextResponse.json({ items });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor=await requireInventoryPermission('catalog');
    const body = await request.json() ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 160 || !units.includes(body.unit) || !kinds.includes(body.kind) ||
      (body.quantity !== undefined && Number(body.quantity) !== 0) || !validQuantity(body.minQuantity ?? 0,body.unit) || !validImage(body.image ?? null)) {
      return NextResponse.json({ error: 'Проверьте название, единицу и количества' }, { status: 400 });
    }
    const item = await withTransaction(async client => {
      await client.query("SELECT set_config('belok.actor_user_id',$1,true)",[actor.id]);
      const id = randomUUID();
      const rows = await client.query(
        `INSERT INTO inventory_items(id,name,kind,unit,quantity,min_quantity,notes,image)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",image,notes,updated_at AS "updatedAt"`,
        [id,name,body.kind,body.unit,0,stockDecimal(stockMilli(body.minQuantity ?? 0,body.unit)),String(body.notes ?? '').slice(0,1000),body.image || null]
      );
      return rows.rows[0];
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch(error) { return errorResponse(error); }
}
export async function PUT(request: NextRequest) {
 try {
  const actor=await requireInventoryPermission('catalog');
  const body=await request.json() ?? {};
  if(typeof body.id!=='string'||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>160||
   !kinds.includes(body.kind)||!units.includes(body.unit)||!validQuantity(body.minQuantity,body.unit)||!validImage(body.image??null))
   return NextResponse.json({error:'Проверьте данные позиции'},{status:400});
  const item=await withTransaction(async client=>{
   await client.query("SELECT set_config('belok.actor_user_id',$1,true)",[actor.id]);
   const current=await client.query<{unit:string;kind:string}>(`SELECT unit,kind FROM inventory_items WHERE id=$1 FOR UPDATE`,[body.id]);
   if(!current.rows.length)return null;
   if(current.rows[0].unit!==body.unit || current.rows[0].kind!==body.kind) {
    const used=await client.query(`SELECT (EXISTS(SELECT 1 FROM inventory_recipe_lines WHERE item_id=$1) OR EXISTS(SELECT 1 FROM inventory_product_links WHERE item_id=$1) OR EXISTS(SELECT 1 FROM inventory_batches WHERE prepared_item_id=$1) OR EXISTS(SELECT 1 FROM inventory_movements WHERE item_id=$1) OR EXISTS(SELECT 1 FROM inventory_items WHERE id=$1 AND quantity<>0)) AS used`,[body.id]);
    if(used.rows[0]?.used)throw Error('ITEM_REFERENCED');
   }
   const updated=await client.query(`UPDATE inventory_items SET name=$2,kind=$3,unit=$4,min_quantity=$5,image=$6,notes=$7,updated_at=NOW() WHERE id=$1
    RETURNING id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",image,notes,updated_at AS "updatedAt"`,
    [body.id,body.name.trim(),body.kind,body.unit,stockDecimal(stockMilli(body.minQuantity,body.unit)),body.image||null,String(body.notes??'').slice(0,1000)]);
   return updated.rows[0];
  });
  return item?NextResponse.json({item}):NextResponse.json({error:'Не найдено'},{status:404});
 }catch(e){if((e as Error).message==='ITEM_REFERENCED')return NextResponse.json({error:'Тип или единицу нельзя изменить: позиция используется в рецептах или товарах'},{status:409});return errorResponse(e)}
}
export async function DELETE(request: NextRequest){
 try{
  const actor=await requireInventoryPermission('catalog');
  const id=new URL(request.url).searchParams.get('id');
  if(!id)return NextResponse.json({error:'Не указан ID'},{status:400});
  const rows=await withTransaction(async client=>{
   await client.query("SELECT set_config('belok.actor_user_id',$1,true)",[actor.id]);
   const result=await client.query(`DELETE FROM inventory_items WHERE id=$1 AND quantity=0 RETURNING id`,[id]);
   return result.rows;
  });
  if(!rows.length)return NextResponse.json({error:'Сначала обнулите остаток; использованные в операциях позиции удалить нельзя'},{status:409});
  return NextResponse.json({ok:true});
 }catch(e){
  if((e as {code?:string}).code==='23503')return NextResponse.json({error:'Позиция используется в рецептах, товарах или журнале движений. Удаление запрещено.'},{status:409});
  return errorResponse(e);
 }
}
export async function PATCH() {
  return NextResponse.json({error:'Остатки меняются через отдельную складскую операцию.'},{status:405});
}
