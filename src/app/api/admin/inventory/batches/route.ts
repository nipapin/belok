import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {withTransaction} from '@/lib/db';
import {requireInventoryPermission} from '@/lib/inventoryAccess';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 try{
  const actor=await requireInventoryPermission('produce');
  const body=await request.json() as {preparedItemId?:string;quantity?:number;note?:string};
  const quantity=Number(body.quantity);
  const preparedItemId=body.preparedItemId;
  if(!preparedItemId||!Number.isFinite(quantity)||quantity<=0||Math.round(quantity*1000)!==quantity||quantity>999999999)return NextResponse.json({error:'Некорректный объём партии'},{status:400});
  const batch=await withTransaction(async client=>{
   await client.query("SELECT set_config('belok.actor_user_id',$1,true)",[actor.id]);
   const prepared=await client.query<{id:string;unit:string}>(`SELECT id::text AS id,unit FROM inventory_items WHERE id::text=$1 AND kind='PREPARED' AND is_active=true`,[preparedItemId]);
   if(!prepared.rowCount)throw new Error('PREPARED_NOT_FOUND');
   const recipe=await client.query<{id:string;outputQuantity:string;outputUnit:string}>(`SELECT id,output_quantity::text AS "outputQuantity",output_unit AS "outputUnit" FROM inventory_recipes WHERE owner_kind='PREPARED' AND owner_id=$1`,[preparedItemId]);
   if(!recipe.rowCount||recipe.rows[0].outputUnit!==prepared.rows[0].unit)throw new Error('BATCH_RECIPE');
   const lines=await client.query<{itemId:string;quantity:string}>(`SELECT item_id::text AS "itemId",quantity::text AS quantity FROM inventory_recipe_lines WHERE recipe_id=$1`,[recipe.rows[0].id]);
   if(!lines.rows.length)throw new Error('BATCH_RECIPE');
   const required=lines.rows.map(l=>({id:l.itemId,amount:Math.round(Number(l.quantity)*quantity/Number(recipe.rows[0].outputQuantity)*1000)/1000}));
   if(required.some(l=>l.amount<=0))throw new Error('BATCH_QUANTITY');
   // Lock ALL affected inventory rows in stable order to prevent deadlocks.
   const ids=[...new Set([preparedItemId,...required.map(l=>l.id)])].sort();
   const locked=await client.query<{id:string;quantity:string;kind:string}>(`SELECT id::text AS id,quantity::text AS quantity,kind FROM inventory_items WHERE id::text=ANY($1::text[]) ORDER BY id FOR UPDATE`,[ids]);
   const stock=new Map(locked.rows.map(x=>[x.id,Number(x.quantity)]));
   if(stock.size!==ids.length)throw new Error('BATCH_ITEMS');
   for(const item of required)if((stock.get(item.id)??0)<item.amount)throw new Error('BATCH_STOCK');
   const batchId=randomUUID();
   await client.query(`INSERT INTO inventory_batches(id,prepared_item_id,output_quantity,note) VALUES ($1,$2,$3,$4)`,[batchId,preparedItemId,quantity,String(body.note??'').slice(0,500)]);
   for(const item of required){
    const next=Math.round(((stock.get(item.id)??0)-item.amount)*1000)/1000;
    await client.query('UPDATE inventory_items SET quantity=$2,updated_at=NOW() WHERE id::text=$1',[item.id,next]);
    await client.query(`INSERT INTO inventory_movements(id,item_id,delta,quantity_after,reason,batch_id,note) VALUES($1,$2,$3,$4,'PRODUCTION_INPUT',$5,'Производство')`,[randomUUID(),item.id,-item.amount,next,batchId]);
   }
   const next=Math.round(((stock.get(preparedItemId)??0)+quantity)*1000)/1000;
   await client.query('UPDATE inventory_items SET quantity=$2,updated_at=NOW() WHERE id::text=$1',[preparedItemId,next]);
   await client.query(`INSERT INTO inventory_movements(id,item_id,delta,quantity_after,reason,batch_id,note) VALUES($1,$2,$3,$4,'PRODUCTION_OUTPUT',$5,'Выпуск заготовки')`,[randomUUID(),preparedItemId,quantity,next,batchId]);
   return batchId;
  });
  return NextResponse.json({batchId:batch},{status:201});
 }catch(e){
  const message=e instanceof Error?e.message:'';
  if(message==='UNAUTHORIZED')return NextResponse.json({error:'Нет доступа'},{status:403});
  const known:Record<string,string>={PREPARED_NOT_FOUND:'Заготовка не найдена',BATCH_RECIPE:'Для заготовки нужна технологическая карта',BATCH_QUANTITY:'Объём партии слишком мал для точного списания',BATCH_ITEMS:'Компонент рецепта не найден',BATCH_STOCK:'Недостаточно остатков для выпуска'};
  if(known[message])return NextResponse.json({error:known[message]},{status:400});
  console.error('Production batch',e);return NextResponse.json({error:'Ошибка производства. Проверьте миграцию.'},{status:500});
 }
}
