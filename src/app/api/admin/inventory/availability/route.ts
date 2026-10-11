import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '@/lib/inventoryAccess';
import { query } from '@/lib/db';
import { loadStockAvailability } from '@/lib/inventoryAvailability.server';
export async function GET() {
 try {
  await requireInventoryPermission('view');
  const products=await query<{id:string;name:string;isAvailable:boolean;categoryActive:boolean}>(`SELECT p.id,p.name,p."isAvailable",c."isActive" AS "categoryActive" FROM products p JOIN categories c ON c.id=p."categoryId" ORDER BY p.name`);
  const stock=await loadStockAvailability(products.map(p=>p.id));
  const dishes=products.map(p=>{ let availability=stock.get(p.id)!; if(!p.isAvailable||!p.categoryActive) availability={...availability,state:'STOP',reasons:['Отключено в меню',...availability.reasons]};return {...p,isCombo:false,...availability}; });
  return NextResponse.json({dishes,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(['UNAUTHORIZED','FORBIDDEN'].includes((error as Error).message))return NextResponse.json({error:'Нет доступа'},{status:403});console.error('Inventory availability',error);return NextResponse.json({error:'Не удалось рассчитать стоп-лист'},{status:500});}
}
