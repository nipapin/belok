import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';

test('remote kiosk commands require settings permission; heartbeats require an unlocked kiosk',async()=>{
  let admin=true;let unlocked=true;let commands=0;let reports=0;
  class KioskUnauthorizedError extends Error {}
  const modules:Record<string,unknown>={
    'next/server':{NextResponse},
    '@/lib/adminAuth':{requireAdmin:async()=>{if(!admin)throw Error('UNAUTHORIZED')}},
    '@/lib/kioskAuth':{KioskUnauthorizedError,requireKioskUnlocked:async()=>{if(!unlocked)throw new KioskUnauthorizedError()},getKioskSettings:async()=>({pinHash:'not-exposed'})},
    '@/lib/buildVersion':{buildVersion:{revision:'1234567',version:'1.0.0'}},
    '@/lib/kioskControl':{
      validKioskClientId:(id:unknown)=>typeof id==='string' && /^[0-9a-f-]{36}$/i.test(id),
      listKioskClients:async()=>[],
      requestKioskRefresh:async()=>{commands++;return{id:'command'}},
      reportKioskClient:async()=>{reports++;return{id:'command'}},
    },
  };
  function load(path:string) {
    const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const exports:{POST?:(request:Request)=>Promise<Response>;GET?:()=>Promise<Response>}={};
    vm.runInNewContext(code,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name]}});
    return exports;
  }
  const adminRoute=load('src/app/api/admin/kiosk/route.ts');
  const kioskRoute=load('src/app/api/kiosk/control/route.ts');
  const request=(body:unknown)=>new Request('http://localhost/api/kiosk/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await adminRoute.POST!(request({action:'refresh'}))).status,200);
  assert.equal((await adminRoute.POST!(request({action:'refresh',clientId:'bad'}))).status,400);
  assert.equal((await (await adminRoute.GET!()).json()).version,'1.0.0');
  admin=false;
  assert.equal((await adminRoute.POST!(request({action:'refresh'}))).status,403);
  assert.equal((await adminRoute.GET!()).status,403);
  assert.equal(commands,1);
  const heartbeat={id:'00000000-0000-4000-8000-000000000001',revision:'1234567',version:'1.0.0',busy:true,lastRefreshId:null};
  const response=await kioskRoute.POST!(request(heartbeat));assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal((await kioskRoute.POST!(request({...heartbeat,revision:'<script>'}))).status,400);
  assert.equal((await kioskRoute.POST!(request({...heartbeat,version:'<script>'}))).status,400);
  assert.equal((await kioskRoute.POST!(request({...heartbeat,version:undefined}))).status,200,'older kiosks can still report without a project version');
  unlocked=false;
  assert.equal((await kioskRoute.POST!(request(heartbeat))).status,401);
  assert.equal(reports,2);
});

test('kiosk payment endpoint accepts cancellation but rejects manual deferred payment',async()=>{
  const cancellations:unknown[][]=[];
  const modules:Record<string,unknown>={
    'next/server':{NextResponse},
    '@/lib/kioskAuth':{requireKioskUnlocked:async()=>{},KioskUnauthorizedError:class extends Error{}},
    '@/lib/db':{queryOne:async()=>({paymentMethod:'CARD'})},
    '@/lib/aqsiJobs':{cancelAqsiCard:async(...args:unknown[])=>{cancellations.push(args)}},
    '@/lib/aqsiCashOrders':{},
    '@/lib/tbankPayments':{},
  };
  const code=ts.transpileModule(readFileSync('src/app/api/kiosk/orders/[id]/payment/route.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const exports:{POST?:(request:Request,context:{params:Promise<{id:string}>})=>Promise<Response>}={};
  vm.runInNewContext(code,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name]}});
  const context={params:Promise.resolve({id:'original-order'})};
  const request=(action:string)=>new Request('http://localhost/api/kiosk/orders/original-order/payment',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action}),
  });
  assert.equal((await exports.POST!(request('defer'),context)).status,400);
  assert.equal(cancellations.length,0,'even an older client cannot start manual deferred payment');
  assert.equal((await exports.POST!(request('cancel'),context)).status,200);
  assert.deepEqual(cancellations,[['original-order','CANCEL']]);
});
