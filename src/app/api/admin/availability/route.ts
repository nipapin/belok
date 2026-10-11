import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { query, withTransaction } from '@/lib/db';
import { writeStaffAudit } from '@/lib/staffAccess';
export async function GET() {
 try {await requireAdmin('availability');return NextResponse.json({products:await query('SELECT id,name,"isAvailable" FROM products ORDER BY name')},{headers:{'Cache-Control':'private, no-store'}})}
 catch(error){return NextResponse.json({error:'Нет доступа'},{status:(error as Error).message==='UNAUTHORIZED'?403:500})}
}
export async function PATCH(request:Request) {
 try {
  const actor=await requireAdmin('availability');const body=await request.json().catch(()=>null);
  if(typeof body?.id!=='string'||typeof body?.isAvailable!=='boolean')return NextResponse.json({error:'Некорректные данные'},{status:400});
  const products=await withTransaction(async client=>{
   const before=await client.query('SELECT "isAvailable" FROM products WHERE id=$1 FOR UPDATE',[body.id]);
   if(!before.rowCount)return [];
   const result=await client.query('UPDATE products SET "isAvailable"=$2,"updatedAt"=NOW() WHERE id=$1 RETURNING id,name,"isAvailable"',[body.id,body.isAvailable]);
   await writeStaffAudit(client,actor.id,'PRODUCT_AVAILABILITY',body.id,{before:String(before.rows[0].isAvailable),after:String(body.isAvailable)});return result.rows;
  });
  return products.length?NextResponse.json({product:products[0]}):NextResponse.json({error:'Блюдо не найдено'},{status:404});
 } catch(error){return NextResponse.json({error:'Не удалось изменить доступность'},{status:(error as Error).message==='UNAUTHORIZED'?403:500})}
}
