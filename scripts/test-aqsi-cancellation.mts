import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import * as roles from '../src/lib/roles';

async function load(path:string,modules:Record<string,unknown>) {
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,(...args:unknown[])=>Promise<unknown>>={};
  vm.runInNewContext(code,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},
    console,process:{env:{AQSI_API_KEY:'test-only'},cwd:()=>process.cwd()},encodeURIComponent});
  return exports;
}

test('admin cancellation reaches aQsi, persists intent and reconciles final status using isolated PostgreSQL',async()=>{
  const modulePath=process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath,'Set isolated PGlite path; application DB is never accessed');
  const {PGlite}=await import(pathToFileURL(modulePath).href);
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE orders(id text PRIMARY KEY,status text DEFAULT 'PENDING',"paymentStatus" text DEFAULT 'PENDING',
      source text DEFAULT 'KIOSK',"paymentMethod" text DEFAULT 'CASH',"tbankPaymentId" text,"userId" text,total int DEFAULT 50);
      CREATE TABLE aqsi_cash_orders(id text PRIMARY KEY,"orderId" text UNIQUE,"deviceId" int,state text,
      payload jsonb,"operationId" text,error text,"checkedAt" timestamptz,"createdAt" timestamptz DEFAULT NOW(),"updatedAt" timestamptz DEFAULT NOW());`);
    const sqlQuery=async(sql:string,params?:unknown[])=>{
      if(sql.includes('pg_advisory') || sql.startsWith('SET LOCAL')) return {rows:[{locked:true}],rowCount:1};
      return db.query(sql,params);
    };
    const dbModule={
      query:async(sql:string,params?:unknown[])=>(await sqlQuery(sql,params)).rows,
      queryOne:async(sql:string,params?:unknown[])=>(await sqlQuery(sql,params)).rows[0] ?? null,
      withTransaction:async(fn:(client:unknown)=>unknown)=>db.transaction(async (tx:{query:typeof sqlQuery})=>fn({query:async(sql:string,params?:unknown[])=>{
        if(sql.includes('pg_advisory') || sql.startsWith('SET LOCAL')) return {rows:[],rowCount:0};
        return tx.query(sql,params);
      }})),
      pool:{connect:async()=>({query:sqlQuery,release:()=>{}})},
    };
    const migration=await load('src/lib/aqsiCancellationMigration.ts',{
      'node:fs/promises':{readFile},'node:path':await import('node:path'),'@/lib/db':dbModule,
    });
    await migration.applyAqsiCancellationMigration();await migration.applyAqsiCancellationMigration();
    assert.equal((await db.query('SELECT * FROM _migrations')).rows.length,1);
    const remotes=new Map<string,{device:number;status:string;content:{additionalAttribute:string};receipts:unknown[]}>();
    const posts:{id:string;status:string;content:unknown}[]=[];
    let delay=false,loseResponse=false,readFailure=false;
    class AqsiRequestError extends Error {ambiguous=true;}
    const aqsiRequest=async(path:string,method='GET',body?:{id:string;status:string;content:unknown})=>{
      assert.ok(path.startsWith('/v2/Orders/simple'),'deferred cancellation must not invoke acquiring/refund/fiscalization');
      if(method==='POST') {
        assert.ok(body);assert.equal(body.status,'Отменен');
        const remote=remotes.get(body.id);assert.ok(remote,'cancellation must never create a new payable order');
        assert.equal(remote.status,'Отложен');assert.equal(remote.receipts.length,0);
        posts.push(body);
        if(!delay) remote.status='Отменен';
        if(loseResponse) throw new AqsiRequestError('Ответ потерян');
        return {guid:'accepted'};
      }
      if(readFailure) throw new AqsiRequestError('Нет связи');
      const remote=remotes.get(decodeURIComponent(path.split('/').pop()!));assert.ok(remote);
      return remote;
    };
    const loyalty:string[]=[];
    const modules={
      'server-only':{},'node:crypto':await import('node:crypto'),'@/lib/db':dbModule,
      '@/lib/aqsi':{aqsiRequest,AqsiRequestError},'@/lib/aqsiConfig':{getAqsiConfig:async()=>({}),aqsiConfigured:()=>false},
      '@/lib/aqsiReceipt':{receiptOrderReference:(id:string)=>'marker:'+id},
      '@/lib/orderLoyalty':{settleOrderLoyalty:async(id:string)=>{loyalty.push(id)}},'@/lib/orderNotify':{},
    };
    let cash=await load('src/lib/aqsiCashOrders.ts',modules);
    async function insert(id:string,state='WAITING',method='CASH') {
      const content={additionalAttribute:'marker:'+id};
      await db.query('INSERT INTO orders(id,"paymentMethod") VALUES($1,$2)',[id,method]);
      await db.query(`INSERT INTO aqsi_cash_orders(id,"orderId","deviceId",state,payload) VALUES($1,$1,784146,$2,$3)`,
        [id,state,JSON.stringify({id:'belok:'+id,device:'784146',number:'1188',content})]);
      remotes.set('belok:'+id,{device:784146,status:'Отложен',content,receipts:[]});
    }
    const order=async(id:string)=>(await db.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];
    const state=async(id:string)=>(await db.query('SELECT * FROM aqsi_cash_orders WHERE id=$1',[id])).rows[0];
    await insert('confirmed');
    assert.equal(await cash.cancelAqsiCashOrder('confirmed'),'cancelled');
    assert.equal((await order('confirmed')).status,'CANCELLED');
    assert.equal(posts.length,1);assert.ok(loyalty.includes('confirmed'));
    assert.equal(await cash.cancelAqsiCashOrder('confirmed'),'cancelled');assert.equal(posts.length,1);
    await insert('unsent','QUEUED');
    assert.equal(await cash.cancelAqsiCashOrder('unsent'),'cancelled');assert.equal(posts.length,1);
    assert.equal((await order('unsent')).status,'CANCELLED');
    await insert('waiting');delay=true;
    assert.equal(await cash.cancelAqsiCashOrder('waiting'),'pending');
    assert.equal((await order('waiting')).status,'PENDING');assert.equal((await state('waiting')).cancelRequested,true);
    remotes.get('belok:waiting')!.status='Отменен';
    // Reload the module to simulate a process restart: no in-memory intent survives.
    cash=await load('src/lib/aqsiCashOrders.ts',modules);await cash.processAqsiCashOrders();
    assert.equal((await order('waiting')).status,'CANCELLED');delay=false;
    await insert('lost');loseResponse=true;
    assert.equal(await cash.cancelAqsiCashOrder('lost'),'pending');
    assert.equal((await state('lost')).state,'UNKNOWN');const count=posts.length;loseResponse=false;
    await cash.processAqsiCashOrders();assert.equal((await order('lost')).status,'CANCELLED');assert.equal(posts.length,count);
    await insert('offline');readFailure=true;
    assert.equal(await cash.cancelAqsiCashOrder('offline'),'pending');assert.equal(posts.length,count);
    readFailure=false;await cash.processAqsiCashOrders();assert.equal((await order('offline')).status,'CANCELLED');
    for(const id of ['paid','partial','wrong-device']) {
      await insert(id);
      const remote=remotes.get('belok:'+id)!;
      if(id==='wrong-device') remote.device=1;
      else {remote.status=id==='paid'?'Оплачен':'Част. оплачен';remote.receipts=[{isNonFiscal:false}];}
      const before:number=posts.length;assert.equal(await cash.cancelAqsiCashOrder(id),'review');
      assert.equal(posts.length,before);assert.equal((await order(id)).status,'PENDING');
    }
    await insert('paid-local');await db.query(`UPDATE orders SET "paymentStatus"='SUCCEEDED' WHERE id='paid-local'`);
    assert.equal(await cash.cancelAqsiCashOrder('paid-local'),'blocked');
    await insert('fallback','WAITING','CARD');
    assert.equal(await cash.cancelAqsiCashOrder('fallback'),'cancelled');

    // Exercise the actual admin route with the real cancellation helper and SQL.
    const route=await load('src/app/api/admin/orders/[id]/route.ts',{
      'next/server':{NextResponse},'@/lib/db':dbModule,'@/lib/adminAuth':{requireAdmin:async()=>({role:'ADMIN'})},
      '@/lib/roles':roles,'@/lib/aqsiCashOrders':cash,'@/lib/aqsiJobs':{},'@/lib/tbank':{},
      '@/lib/push':{},'@/lib/notificationSettings':{},'@/lib/orderLoyalty':modules['@/lib/orderLoyalty'],
      '@/lib/queries/adminOrders':{fetchAdminOrderById:order},
    });
    const cancel=async(id:string)=>await route.PUT(new NextRequest('http://test/api/admin/orders/'+id,{
      method:'PUT',body:JSON.stringify({status:'CANCELLED'}),
    }),{params:Promise.resolve({id})}) as Response;
    await insert('api');assert.equal((await cancel('api')).status,200);assert.equal((await order('api')).status,'CANCELLED');
    await insert('api-pending');delay=true;
    const pending=await cancel('api-pending');assert.equal(pending.status,202);assert.ok((await pending.json()).notice);
    assert.equal((await order('api-pending')).status,'PENDING');
    assert.equal((await cancel('paid-local')).status,409);
    assert.equal((await cancel('partial')).status,409);
  } finally {await db.close();}
});
