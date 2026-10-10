import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
import {requireInventoryPermission} from '@/lib/inventoryAccess';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 try{
  await requireInventoryPermission('audit');
  const itemId=request.nextUrl.searchParams.get('itemId');
  const events=await query(`SELECT a.id,a.item_id AS "itemId",a.action,a.before_state AS "before",a.after_state AS "after",a.occurred_at AS "at",u.name AS "actorName",u.email AS "actorEmail"
    FROM inventory_audit_events a LEFT JOIN users u ON u.id=a.actor_user_id
    WHERE ($1::uuid IS NULL OR a.item_id=$1::uuid)
    ORDER BY a.id DESC LIMIT 100`,[itemId||null]);
  return NextResponse.json({events});
 }catch(e){
  if(['UNAUTHORIZED','FORBIDDEN'].includes((e as Error).message))return NextResponse.json({error:'Нет доступа'},{status:403});
  console.error('Inventory audit',e);return NextResponse.json({error:'Ошибка журнала'},{status:500});
 }
}
