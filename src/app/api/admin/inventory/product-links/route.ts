import {NextRequest,NextResponse} from 'next/server';
import {query,withTransaction} from '@/lib/db';
import {requireAdmin} from '@/lib/adminAuth';
import {stockMilli, stockDecimal, type InventoryUnit} from '@/lib/inventoryStock';
export const dynamic='force-dynamic';
const fail=(e:unknown)=>{if((e as Error).message==='UNAUTHORIZED')return NextResponse.json({error:'Нет доступа'},{status:403});console.error('Product stock link',e);return NextResponse.json({error:'Не удалось открыть складскую привязку. Проверьте миграцию dev.'},{status:500});};
export async function GET(request:NextRequest){
 try{await requireAdmin();const productId=request.nextUrl.searchParams.get('productId');
 if(!productId)return NextResponse.json({error:'Укажите продукт'},{status:400});
 const rows=await query<{itemId:string;quantity:string}>(`SELECT item_id::text AS "itemId",quantity::text AS quantity FROM inventory_product_links WHERE product_id=$1`,[productId]);
 return NextResponse.json({link:rows[0]??null});
 }catch(e){return fail(e);}
}
export async function PUT(request:NextRequest){
 try{await requireAdmin();const data=await request.json() as {productId?:string;itemId?:string|null;quantity?:number};
 if(!data.productId||typeof data.productId!=='string')return NextResponse.json({error:'Укажите продукт'},{status:400});
 let amount='0';
 if(data.itemId)try{const milli=stockMilli(data.quantity,'g');if(milli<=0)throw Error('INVALID_QUANTITY');amount=stockDecimal(milli);}catch{return NextResponse.json({error:'Некорректное количество'},{status:400});}
 await withTransaction(async client=>{
 const p=await client.query<{isCombo:boolean}>(`SELECT COALESCE("isCombo",false) AS "isCombo" FROM products WHERE id=$1 FOR UPDATE`,[data.productId]);
 if(!p.rowCount||p.rows[0].isCombo)throw Error('INVALID_PRODUCT');
 if(!data.itemId){await client.query('DELETE FROM inventory_product_links WHERE product_id=$1',[data.productId]);return;}
 const i=await client.query<{unit:string}>(`SELECT unit FROM inventory_items WHERE id::text=$1 AND is_active=true AND kind IN ('UNSPECIFIED','RAW','PURCHASED','PACKAGING') FOR SHARE`,[data.itemId]);
 if(!i.rowCount)throw Error('INVALID_ITEM');
 try{stockMilli(data.quantity,i.rows[0].unit as InventoryUnit);}catch{throw Error('INVALID_QUANTITY');}
 await client.query(`INSERT INTO inventory_product_links(product_id,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(product_id) DO UPDATE SET item_id=EXCLUDED.item_id,quantity=EXCLUDED.quantity,updated_at=NOW()`,[data.productId,data.itemId,amount]);
 });
 return NextResponse.json({ok:true});
 }catch(e){const m=(e as Error).message;if(m==='UNAUTHORIZED')return fail(e);if(m==='INVALID_QUANTITY')return NextResponse.json({error:'Проверьте количество и единицу складской позиции'},{status:400});if(m==='INVALID_PRODUCT'||m==='INVALID_ITEM')return NextResponse.json({error:'Продукт или складская позиция не найдены'},{status:400});return fail(e);}
}
