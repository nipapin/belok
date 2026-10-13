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
    '@/lib/buildVersion':{buildVersion:{revision:'1234567'}},
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
  admin=false;
  assert.equal((await adminRoute.POST!(request({action:'refresh'}))).status,403);
  assert.equal((await adminRoute.GET!()).status,403);
  assert.equal(commands,1);
  const heartbeat={id:'00000000-0000-4000-8000-000000000001',revision:'1234567',busy:true,lastRefreshId:null};
  const response=await kioskRoute.POST!(request(heartbeat));assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal((await kioskRoute.POST!(request({...heartbeat,revision:'<script>'}))).status,400);
  unlocked=false;
  assert.equal((await kioskRoute.POST!(request(heartbeat))).status,401);
  assert.equal(reports,1);
});
