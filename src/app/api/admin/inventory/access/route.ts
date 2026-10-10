import {NextRequest,NextResponse} from 'next/server';
import {query,withTransaction} from '@/lib/db';
import {requireInventoryPermission} from '@/lib/inventoryAccess';
export const dynamic='force-dynamic';
const roles=['SUPERADMIN','MANAGER','STOCK','VIEWER'] as const;
export async function GET(){
 try{
  await requireInventoryPermission('manage_access');
  const users=await query(`SELECT u.id,u.email,u.name,a.access_role AS role,a.granted_at AS "grantedAt"
    FROM users u LEFT JOIN inventory_access a ON a.user_id=u.id WHERE u.role='ADMIN' ORDER BY u.email`);
  return NextResponse.json({users});
 }catch(e){return NextResponse.json({error:(e as Error).message==='FORBIDDEN'?'Недостаточно прав':'Нет доступа'},{status:403})}
}
export async function PUT(request:NextRequest){
 try{
  const actor=await requireInventoryPermission('manage_access');
  const body=await request.json() as {userId?:string;role?:string};
  if(!body.userId||!roles.includes(body.role as typeof roles[number]))return NextResponse.json({error:'Некорректные данные'},{status:400});
  await withTransaction(async client=>{
   const target=await client.query(`SELECT id FROM users WHERE id=$1 AND role='ADMIN'`,[body.userId]);
   if(!target.rowCount)throw Error('USER_NOT_ADMIN');
   await client.query(`INSERT INTO inventory_access(user_id,access_role,granted_by) VALUES($1,$2,$3)
    ON CONFLICT(user_id) DO UPDATE SET access_role=EXCLUDED.access_role,granted_by=EXCLUDED.granted_by,granted_at=NOW()`,[body.userId,body.role,actor.id]);
  });
  return NextResponse.json({ok:true});
 }catch(e){
  if((e as Error).message==='USER_NOT_ADMIN')return NextResponse.json({error:'Сначала назначьте пользователя администратором'},{status:400});
  if(['FORBIDDEN','UNAUTHORIZED'].includes((e as Error).message))return NextResponse.json({error:'Недостаточно прав'},{status:403});
  console.error('Inventory access',e);return NextResponse.json({error:'Ошибка сохранения'},{status:500});
 }
}
