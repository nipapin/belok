import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
const validImage = (v: unknown) => v === null || (typeof v === 'string' && v.length <= 2048 && (v === '' || v.startsWith('/uploads/') || /^https:\/\//.test(v)));
const units = ['g', 'ml', 'pcs'] as const;
const kinds = ['RAW', 'PREPARED', 'PACKAGING'] as const;
const validQuantity = (value: unknown) => {
  const n = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n >= 0 && Math.round(n * 1000) === n * 1000 && n <= 999999999;
};
const errorResponse = (error: unknown) => {
  if ((error as Error).message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'Такая позиция уже существует' }, { status: 409 });
  console.error('Inventory API:', error);
  return NextResponse.json({ error: 'Ошибка склада. Проверьте, что миграция применена.' }, { status: 500 });
};
export async function GET() {
  try {
    await requireAdmin();
    const items = await query(`SELECT id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",image,notes,is_active AS "isActive" FROM inventory_items ORDER BY name COLLATE "default"`);
    return NextResponse.json({ items });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 160 || !units.includes(body.unit) || !kinds.includes(body.kind) ||
      !validQuantity(body.quantity) || !validQuantity(body.minQuantity ?? 0) || !validImage(body.image ?? null)) {
      return NextResponse.json({ error: 'Проверьте название, единицу и количества' }, { status: 400 });
    }
    const item = await withTransaction(async client => {
      const id = randomUUID();
      const rows = await client.query(
        `INSERT INTO inventory_items(id,name,kind,unit,quantity,min_quantity,notes,image)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",image,notes`,
        [id,name,body.kind,body.unit,body.quantity,body.minQuantity ?? 0,String(body.notes ?? '').slice(0,1000),body.image || null]
      );
      if (Number(body.quantity) > 0) await client.query(
        `INSERT INTO inventory_movements(id,item_id,delta,quantity_after,reason,note) VALUES ($1,$2,$3,$3,'OPENING','Первичный остаток')`,
        [randomUUID(),id,body.quantity]
      );
      return rows.rows[0];
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch(error) { return errorResponse(error); }
}
export async function PUT(request: NextRequest) {
 try {
  await requireAdmin();
  const body=await request.json();
  if(typeof body.id!=='string'||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>160||
   !kinds.includes(body.kind)||!units.includes(body.unit)||!validQuantity(body.minQuantity)||!validImage(body.image??null))
   return NextResponse.json({error:'Проверьте данные позиции'},{status:400});
  const item=await withTransaction(async client=>{
   const current=await client.query<{unit:string;kind:string}>(`SELECT unit,kind FROM inventory_items WHERE id=$1 FOR UPDATE`,[body.id]);
   if(!current.rows.length)return null;
   if(current.rows[0].unit!==body.unit || current.rows[0].kind!==body.kind) {
    const used=await client.query(`SELECT (EXISTS(SELECT 1 FROM inventory_recipe_lines WHERE item_id=$1) OR EXISTS(SELECT 1 FROM inventory_product_links WHERE item_id=$1) OR EXISTS(SELECT 1 FROM inventory_batches WHERE prepared_item_id=$1)) AS used`,[body.id]);
    if(used.rows[0]?.used)throw Error('ITEM_REFERENCED');
   }
   const updated=await client.query(`UPDATE inventory_items SET name=$2,kind=$3,unit=$4,min_quantity=$5,image=$6,updated_at=NOW() WHERE id=$1
    RETURNING id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",image,notes`,
    [body.id,body.name.trim(),body.kind,body.unit,body.minQuantity,body.image||null]);
   return updated.rows[0];
  });
  return item?NextResponse.json({item}):NextResponse.json({error:'Не найдено'},{status:404});
 }catch(e){if((e as Error).message==='ITEM_REFERENCED')return NextResponse.json({error:'Тип или единицу нельзя изменить: позиция используется в рецептах или товарах'},{status:409});return errorResponse(e)}
}
export async function DELETE(request: NextRequest){
 try{
  await requireAdmin();
  const id=new URL(request.url).searchParams.get('id');
  if(!id)return NextResponse.json({error:'Не указан ID'},{status:400});
  const rows=await query(`DELETE FROM inventory_items WHERE id=$1 AND quantity=0 RETURNING id`,[id]);
  if(!rows.length)return NextResponse.json({error:'Сначала обнулите остаток; использованные в операциях позиции удалить нельзя'},{status:409});
  return NextResponse.json({ok:true});
 }catch(e){
  if((e as {code?:string}).code==='23503')return NextResponse.json({error:'Позиция используется в рецептах, товарах или журнале движений. Удаление запрещено.'},{status:409});
  return errorResponse(e);
 }
}
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    if (typeof body.id !== 'string' || !validQuantity(body.quantity) || (body.minQuantity !== undefined && !validQuantity(body.minQuantity))) {
      return NextResponse.json({ error: 'Некорректное количество' }, { status: 400 });
    }
    const result = await withTransaction(async client => {
      const locked = await client.query<{ quantity: string }>('SELECT quantity::text AS quantity FROM inventory_items WHERE id=$1 FOR UPDATE',[body.id]);
      if (!locked.rows.length) return null;
      const original = Number(locked.rows[0].quantity);
      const next = Number(body.quantity);
      const updated = await client.query(
        `UPDATE inventory_items SET quantity=$2, min_quantity=COALESCE($3,min_quantity),updated_at=NOW()
         WHERE id=$1 RETURNING id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",notes`,
        [body.id,next,body.minQuantity ?? null]
      );
      if (next !== original) await client.query(
        `INSERT INTO inventory_movements(id,item_id,delta,quantity_after,reason,note) VALUES ($1,$2,$3,$4,'RECOUNT',$5)`,
        [randomUUID(),body.id,next-original,next,String(body.note ?? 'Ручная корректировка').slice(0,500)]
      );
      return updated.rows[0];
    });
    return result ? NextResponse.json({ item: result }) : NextResponse.json({ error: 'Позиция не найдена' },{status:404});
  } catch(error) { return errorResponse(error); }
}
