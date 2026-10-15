import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import * as roles from '../src/lib/roles';

type RouteContext = {params:Promise<{id:string}>};
type TestExports = {
 requireAdmin: (permission?:roles.Permission)=>Promise<roles.AccessUser>;
 DELETE: (request:NextRequest,context:RouteContext)=>Promise<Response>;
 PATCH: (request:NextRequest,context:RouteContext)=>Promise<Response>;
 PUT: (request:NextRequest,context:RouteContext)=>Promise<Response>;
 requireBoardAccess: ()=>Promise<{canComplete:boolean}>;
};
async function load(path: string, modules: Record<string, unknown>) {
 const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const exports: Partial<TestExports> = {};
 vm.runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in modules, `Missing test dependency ${name}`); return modules[name]; }, URL, Date, console });
 return exports as TestExports;
}
test('manual roles replace legacy admin access; combinations union only assigned roles', () => {
 const admin={role:'ADMIN'}; const cook={role:'ADMIN',staffRoles:['COOK']};
 for(const permission of ['settings','menu','reports','people','orders','refund','inventory_access'] as const){assert.ok(roles.hasPermission(admin,permission));assert.equal(roles.hasPermission(cook,permission),false)}
 assert.ok(roles.hasPermission(cook,'kitchen'));assert.ok(roles.hasPermission(cook,'availability'));
 assert.equal(roles.hasPermission({role:'USER'},'kitchen'),false);
 assert.equal(roles.hasPermission({role:'ADMIN',staffRoles:['USER']},'settings'),false);
 assert.ok(roles.hasPermission({role:'USER',staffRoles:['CASHIER','STOCKKEEPER']},'inventory_stock'));
 assert.equal(roles.hasPermission({role:'USER',staffRoles:['CASHIER','STOCKKEEPER']},'menu'),false);
 assert.equal(roles.hasPermission({role:'USER',staffRoles:['CASHIER']},'refund'),false);
 assert.equal(roles.hasPermission({role:'USER',staffRoles:['MANAGER']},'settings'),false);
 assert.equal(roles.hasPermission({role:'ADMIN',staffRoles:['UNKNOWN']},'settings'),false);
 assert.equal(roles.canAccessPage(cook,'/admin/settings'),false); assert.ok(roles.canAccessPage(cook,'/admin/availability'));
 assert.equal(roles.canAccessPage(cook,'/admin/products/123/edit'),false);
 assert.equal(roles.staffHome(cook),'/order-board');
 assert.equal(roles.validStaffRoles(['COOK','CASHIER']),true);
 for(const value of [['ADMIN'],['COOK','COOK'],['USER','OWNER'],[],null,'OWNER'])assert.equal(roles.validStaffRoles(value),false);
});
test('manager cannot grant privilege, restore legacy ADMIN, or edit a privileged employee', () => {
 const actor={role:'USER',staffRoles:['MANAGER']};
 assert.ok(roles.canAssignRoles(actor,{role:'USER'},['COOK']));
 assert.equal(roles.canAssignRoles(actor,{role:'USER'},['OWNER']),false);
 assert.equal(roles.canAssignRoles(actor,{role:'USER'},['MANAGER']),false);
 assert.equal(roles.canAssignRoles(actor,{role:'ADMIN',staffRoles:['COOK']},null),false);
 assert.equal(roles.canAssignRoles(actor,{role:'USER',staffRoles:['OWNER']},['COOK']),false);
});
test('real server guard rejects old ADMIN assigned to cook before destructive APIs touch DB', async () => {
 const guard=await load('src/lib/adminAuth.ts',{'./auth':{getCurrentUser:async()=>({role:'ADMIN',staffRoles:['COOK']})},'./roles':roles});
 await assert.rejects(()=>guard.requireAdmin(),/UNAUTHORIZED/);
 await assert.rejects(()=>guard.requireAdmin('menu'),/UNAUTHORIZED/);
 await guard.requireAdmin('kitchen');
 const products=await load('src/app/api/admin/products/[id]/route.ts',{
  'next/server':{NextResponse},'uuid':{v4:()=> 'unused'},'@/lib/db':{query:()=>{throw Error('Forbidden request touched DB')},queryOne:()=>{throw Error('Forbidden request touched DB')},withTransaction:()=>{throw Error('Forbidden request touched DB')}},
  '@/lib/adminAuth':guard, '@/lib/uploadStorage':{}, '@/lib/queries/products':{}, '@/lib/productVariants':{}, '@/lib/productSpiciness':{},
  '@/lib/productToppings.server':{replaceProductToppings:()=>{throw Error('Forbidden request touched toppings')},ToppingValidationError:class extends Error {}},
 });
 assert.equal((await products.DELETE(new NextRequest('http://test'),{params:Promise.resolve({id:'product'})})).status,403);
});
test('manual assignments are transactional, preserve original roles, protect self access, and immediately restrict APIs', async () => {
 const modulePath=process.env.INVENTORY_TEST_PGLITE_MODULE;assert.ok(modulePath,'Use isolated PGlite only');
 const {PGlite}=await import(pathToFileURL(modulePath).href);const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE users(id text PRIMARY KEY,role text,"bonusBalance" int DEFAULT 0,"loyaltyLevelId" text,"passwordHash" text);
   CREATE TABLE app_settings(key text PRIMARY KEY,value jsonb,"updatedAt" timestamp DEFAULT NOW());
   CREATE TABLE bonus_transactions(id text,"userId" text,amount int,type text,description text);
   INSERT INTO users(id,role,"passwordHash") VALUES('owner','ADMIN','private'),('cook','ADMIN','private'),('guest','USER','private');`);
  const getUser=async(id:string)=>{const result=await db.query(`SELECT u.*,a.value->'roles' AS "staffRoles" FROM users u LEFT JOIN app_settings a ON a.key='employee_roles:'||u.id WHERE u.id=$1`,[id]);return (result.rows[0]??null) as ({id:string;role:string;staffRoles:string[]|null}|null)};
  let actorId='owner';
  const auth={getCurrentUser:()=>getUser(actorId),getUserWithLoyaltyById:getUser};
  const guard=await load('src/lib/adminAuth.ts',{'./auth':auth,'./roles':roles});
  let auditSequence=0;
  const client={query:async(sql:string,args:unknown[])=>sql.includes('pg_advisory')?{rows:[]}:await db.query(sql,args)};
  const dbModule={withTransaction:async(fn:(c:typeof client)=>Promise<unknown>)=>{await db.exec('BEGIN');try{const result=await fn(client);await db.exec('COMMIT');return result}catch(e){await db.exec('ROLLBACK');throw e}}};
  const staffAccess={staffRolesKey:(id:string)=>'employee_roles:'+id,writeStaffAudit:async(c:typeof client,actorId:string,action:string,targetId:string,details:unknown)=>c.query('INSERT INTO app_settings(key,value) VALUES($1,$2::jsonb)',['staff_audit:'+(++auditSequence),JSON.stringify({actorId,action,targetId,details})])};
  const users=await load('src/app/api/admin/users/[id]/route.ts',{'next/server':{NextResponse},'uuid':{v4:()=> 'test-id'},'@/lib/db':dbModule,'@/lib/adminAuth':guard,'@/lib/roles':roles,'@/lib/staffAccess':staffAccess,'@/lib/auth':auth,'@/lib/userClient':{toClientUser:(u:roles.AccessUser & {id:string})=>({id:u.id,role:u.role,staffRoles:u.staffRoles})}});
  const put=(id:string,body:unknown)=>users.PUT(new NextRequest('http://test',{method:'PUT',body:JSON.stringify(body)}),{params:Promise.resolve({id})});
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM app_settings')).rows[0].count,0,'No backfill');
  assert.equal((await put('cook',{staffRoles:['COOK']})).status,200);
  assert.equal((await getUser('cook'))!.role,'ADMIN','Manual assignment does not rewrite legacy role');
  assert.deepEqual((await getUser('cook'))!.staffRoles,['COOK']);
  actorId='cook';assert.equal((await put('guest',{staffRoles:['OWNER']})).status,403);await assert.rejects(()=>guard.requireAdmin('menu'),/UNAUTHORIZED/);
  actorId='owner';assert.equal((await put('owner',{staffRoles:['COOK']})).status,409);assert.equal((await getUser('owner'))!.staffRoles,null);
  assert.equal((await put('owner',{staffRoles:['OWNER']})).status,200,'Sole admin can assign themselves owner');
  assert.equal((await put('guest',{staffRoles:['OWNER','USER']})).status,400);
  assert.equal((await put('guest',{staffRoles:['CASHIER','COOK']})).status,200);assert.equal((await getUser('guest'))!.role,'USER');
  assert.equal((await put('guest',{staffRoles:['MANAGER']})).status,200);
  actorId='guest';assert.equal((await put('cook',{staffRoles:['OWNER']})).status,403);assert.equal((await put('cook',{staffRoles:null})).status,403);
  assert.equal((await put('owner',{staffRoles:['COOK']})).status,403);
  assert.equal((await put('cook',{staffRoles:['CASHIER','COOK']})).status,200);
  actorId='owner';assert.equal((await put('cook',{staffRoles:null})).status,200);assert.equal((await getUser('cook'))!.staffRoles,null);
  assert.equal((await put('missing',{staffRoles:['COOK']})).status,404);
  assert.ok((await db.query("SELECT key FROM app_settings WHERE key LIKE 'staff_audit:%'")).rows.length>=5);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM users WHERE role='ADMIN'")).rows[0].count,2);
 }finally{await db.close()}
});
test('assigned cook cannot bypass dispatch restriction with remembered kiosk PIN', async () => {
 let user:roles.AccessUser={role:'ADMIN',staffRoles:['COOK']};let pinChecks=0;
 class KioskUnauthorizedError extends Error {}
 const access=await load('src/lib/orderBoardAccess.ts',{'./auth':{getCurrentUser:async()=>user},'./roles':roles,'./kioskAuth':{isKioskUnlocked:async()=>{pinChecks++;return true},KioskUnauthorizedError}});
 assert.equal((await access.requireBoardAccess()).canComplete,false);assert.equal(pinChecks,0);
 user={role:'USER',staffRoles:['USER']};await assert.rejects(()=>access.requireBoardAccess());assert.equal(pinChecks,0);
 user={role:'USER'};assert.equal((await access.requireBoardAccess()).canComplete,true,'Existing PIN-only workstations remain compatible');
 user={role:'USER',staffRoles:['CASHIER']};assert.equal((await access.requireBoardAccess()).canComplete,true);
});
test('kitchen status API rejects dispatch before mutation but accepts cooking transitions', async () => {
 let canComplete=false;let mutations=0;
 class KioskUnauthorizedError extends Error {}
 const route=await load('src/app/api/order-board/[id]/status/route.ts',{
  'next/server':{NextResponse,after:()=>{}},'@/lib/db':{query:async()=>{mutations++;return [{id:'order',status:'PREPARING',userId:null,paymentStatus:'PENDING'}]},queryOne:async()=>null},
  '@/lib/orderBoardAccess':{requireBoardAccess:async()=>({canComplete})},'@/lib/kioskAuth':{KioskUnauthorizedError},
  '@/lib/orderLoyalty':{settleOrderLoyalty:async()=>{}},'@/lib/notificationSettings':{},'@/lib/push':{},
 });
 const patch=(status:string)=>route.PATCH(new NextRequest('http://test',{method:'PATCH',body:JSON.stringify({status})}),{params:Promise.resolve({id:'order'})});
 assert.equal((await patch('COMPLETED')).status,403);assert.equal(mutations,0);
 assert.equal((await patch('CANCELLED')).status,400);assert.equal(mutations,0);
 assert.equal((await patch('PREPARING')).status,200);assert.equal(mutations,1);
 canComplete=true;assert.equal((await patch('COMPLETED')).status,200);assert.equal(mutations,2);
});
test('cashier cannot cancel a paid order or invoke bank refund', async () => {
 let refundCalled=false;let mutated=false;
 const route=await load('src/app/api/admin/orders/[id]/route.ts',{
  'next/server':{NextResponse},'@/lib/db':{query:async()=>{mutated=true;return []},queryOne:async()=>({status:'PREPARING',paymentStatus:'SUCCEEDED',tbankPaymentId:'paid',source:'APP',paymentMethod:'CARD'})},
  '@/lib/adminAuth':{requireAdmin:async()=>({id:'cashier',role:'USER',staffRoles:['CASHIER']})},'@/lib/roles':roles,
  '@/lib/push':{},'@/lib/notificationSettings':{},'@/lib/orderLoyalty':{},'@/lib/queries/adminOrders':{},
  '@/lib/tbank':{tbankCancel:()=>{refundCalled=true}},'@/lib/aqsiJobs':{},'@/lib/aqsiCashOrders':{},
 });
 const response=await route.PUT(new NextRequest('http://test',{method:'PUT',body:JSON.stringify({status:'CANCELLED'})}),{params:Promise.resolve({id:'order'})});
 assert.equal(response.status,403);assert.equal(refundCalled,false);assert.equal(mutated,false);
});
