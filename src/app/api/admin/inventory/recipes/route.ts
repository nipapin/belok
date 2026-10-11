import { NextRequest,NextResponse } from 'next/server';
import { query,withTransaction } from '@/lib/db';
import {requireInventoryPermission} from '@/lib/inventoryAccess';
import { saveRecipe,type RecipeInput } from '@/lib/inventoryRecipes';

export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  await requireInventoryPermission('view');
  const ownerKind=req.nextUrl.searchParams.get('ownerKind');
  const ownerId=req.nextUrl.searchParams.get('ownerId');
  if(!ownerKind&&!ownerId){
   const recipes=await query(`SELECT p.id AS "ownerId",'PRODUCT' AS "ownerKind",p.name,'pcs' AS unit,
    r.id AS "recipeId",r.output_quantity::text AS "outputQuantity",r.output_unit AS "outputUnit",
    (SELECT count(*)::int FROM inventory_recipe_lines l WHERE l.recipe_id=r.id) AS "lineCount"
    FROM products p LEFT JOIN inventory_recipes r ON r.owner_kind='PRODUCT' AND r.owner_id=p.id
    WHERE COALESCE(p."isCombo",false)=false
    UNION ALL SELECT i.id::text,'PREPARED',i.name,i.unit,r.id,r.output_quantity::text,r.output_unit,
    (SELECT count(*)::int FROM inventory_recipe_lines l WHERE l.recipe_id=r.id)
    FROM inventory_items i LEFT JOIN inventory_recipes r ON r.owner_kind='PREPARED' AND r.owner_id=i.id::text
    WHERE i.kind='PREPARED' AND i.is_active=true ORDER BY name`);
   return NextResponse.json({recipes},{headers:{'Cache-Control':'no-store'}});
  }
  if(ownerKind!=='PRODUCT'&&ownerKind!=='PREPARED')return NextResponse.json({error:'Invalid ownerKind'},{status:400});
  if(!ownerId)return NextResponse.json({error:'Invalid ownerId'},{status:400});
  const rows=await query<{id:string;outputQuantity:string;outputUnit:string;itemId:string|null;quantity:string|null;instructions:string}>(`SELECT r.id,r.output_quantity::text AS "outputQuantity",r.output_unit AS "outputUnit",r.instructions,l.item_id::text AS "itemId",l.quantity::text AS quantity
 FROM inventory_recipes r LEFT JOIN inventory_recipe_lines l ON l.recipe_id=r.id WHERE r.owner_kind=$1 AND r.owner_id=$2 ORDER BY l.id`,[ownerKind,ownerId]);
  if(!rows.length)return NextResponse.json({recipe:null});
  return NextResponse.json({recipe:{outputQuantity:Number(rows[0].outputQuantity),outputUnit:rows[0].outputUnit,instructions:rows[0].instructions,lines:rows.filter(x=>x.itemId).map(x=>({itemId:x.itemId,quantity:Number(x.quantity)}))}});
 }catch(e){return error(e);}
}
export async function PUT(req:NextRequest){
 try{const actor=await requireInventoryPermission('catalog');const data=await req.json() as RecipeInput;
 await withTransaction(async client=>{await client.query("SELECT set_config('belok.actor_user_id',$1,true)",[actor.id]);await saveRecipe(client,data)});
 return NextResponse.json({ok:true});
 }catch(e){return error(e);}
}
function error(e:unknown){
 const message=e instanceof Error?e.message:'';
 if(message==='UNAUTHORIZED'||message==='FORBIDDEN')return NextResponse.json({error:'Нет доступа'},{status:403});
 if(message.startsWith('RECIPE_'))return NextResponse.json({error:({
 RECIPE_INVALID:'Проверьте состав и количества',RECIPE_OWNER:'Продукт или заготовка не найдены',RECIPE_ITEMS:'Выбраны недоступные компоненты',RECIPE_CYCLE:'Циклическая рецептура запрещена'
 } as Record<string,string>)[message]??message},{status:400});
 console.error('Recipe API',e);return NextResponse.json({error:'Ошибка сохранения техкарты. Проверьте наличие миграции.'},{status:500});
}
