import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import type { Pool } from 'pg';

// Isolated fake pool: never connects to PostgreSQL or a real aQsi account.
const config={enabled:true,deviceId:784146,catalogEnabled:true,taxRateId:6,taxSystemCode:2,calculationTypeId:4,calculationSubjectId:1};
const category=(id:string,name:string)=>({id,name,defaultTax:6,defaultSubject:1,defaultPaymentMethodType:4,defaultUnit:'шт.',defaultUnitCode:0});
const good=(id:string,group_id:string)=>({id,group_id,name:id+' ',price:200,nonTradable:false,tax:6,subject:1,paymentMethodType:4,type:'simple',unit:'шт.',unitCode:0});
const sync={phase:'CATEGORIES',revision:'4',syncedRevision:'0',submittedRevision:'4',taskId:'old-rejected-task' as string|null,
  pendingGoods:{categories:[category('belok:burger','Бургеры '),category('belok:breakfast','Завтраки')],goods:[good('belok:p','belok:burger')]},
  knownGoods:[],cursor:0,updatedAt:new Date(),error:null as string|null};
const fake={
  async connect(){return {async query(sql:string){return {rows:sql.includes('pg_try_advisory_lock')?[{locked:true}]:[]}},release(){}}},
  async query(sql:string,params:unknown[]=[]){
    if(sql.includes('FROM "app_settings"'))return {rows:[{value:config}]};
    if(sql.startsWith('SELECT * FROM aqsi_catalog_sync'))return {rows:[structuredClone(sync)]};
    if(sql.includes('SET "pendingGoods"=$1')){sync.pendingGoods=JSON.parse(String(params[0]));sync.taskId=null;sync.error=null;}
    else if(sql.includes("SET phase='GOODS'")){sync.phase='GOODS';sync.taskId=String(params[0]);}
    else if(sql.includes("SET phase='IDLE'")){sync.phase='IDLE';sync.syncedRevision=sync.submittedRevision;sync.error=null;}
    else if(sql.includes('SET "taskId"=$1'))sync.taskId=String(params[0]);
    else if(sql.includes('SET error=$1'))sync.error=String(params[0]);
    else throw new Error('Unexpected SQL: '+sql);
    return {rows:[]};
  }
};
globalThis.__pgPool=fake as unknown as Pool;
process.env.AQSI_API_KEY='mock-only';
const {reconcileCategories,processAqsiCatalog}=await import('../src/lib/aqsiCatalog');

test('reuse nested categories by normalized name; persist references without changing shared defaults',()=>{
  const pending=structuredClone(sync.pendingGoods);
  const roots=[{id:'root',name:'Root',children:[{id:'remote-burger',name:'БУРГЕРЫ',defaultTax:1,defaultPaymentMethodType:1}]}];
  const next=reconcileCategories(pending,roots);
  assert.equal(next.categories[0].id,'remote-burger');
  assert.equal(next.categories[0].shared,true);
  assert.equal(next.goods[0].group_id,'remote-burger');
  assert.equal(pending.goods[0].group_id,'belok:burger','input must stay unchanged');
  assert.deepEqual(reconcileCategories(next,roots),next,'persisted mapping is stable on restart');
});

test('ambiguous names stop before any writes',()=>{
  assert.throws(()=>reconcileCategories(sync.pendingGoods,[{id:'a',name:'Бургеры'},{id:'b',name:' Бургеры '}]),/Несколько категорий/);
});

test('resume rejected category batch, upload only missing categories, then link goods and expose bulk error',async()=>{
  const original=globalThis.fetch;
  let remote=[category('remote-burger','Бургеры')];
  const posts:{path:string;payload:Record<string,unknown>[]}[]=[];
  let rejected=true;
  globalThis.fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(init?.method==='POST'){
      assert.ok(init.body instanceof FormData);
      const file=init.body.get('file');assert.ok(file instanceof Blob);
      const body=JSON.parse(gunzipSync(new Uint8Array(await file.arrayBuffer())).toString());
      assert.equal(body.removeObsolete,false);
      posts.push({path,payload:body.payload});
      return Response.json({guid:'task-'+posts.length});
    }
    if(path.endsWith('/GoodsCategory/list'))return Response.json(remote);
    if(path.endsWith('/ListGoods/task-2/status'))return Response.json(rejected ? {status:'error',errorText:'Тестовая ошибка товаров'} : {status:'success'});
    if(path.includes('/Goods/'))return Response.json({...posts[1].payload[0],name:String(posts[1].payload[0].name).trim()});
    throw new Error('Unexpected API call: '+path);
  };
  try {
    await processAqsiCatalog();
    assert.equal(posts.length,1);
    assert.deepEqual(posts[0].payload.map(c=>c.name),['Завтраки']);
    assert.equal('shared' in posts[0].payload[0],false);
    assert.equal(sync.pendingGoods.goods[0].group_id,'remote-burger');
    remote=[...remote,category('belok:breakfast','Завтраки')];
    // Shared category defaults can differ: the sync must not change them.
    remote[0].defaultTax=1;
    await processAqsiCatalog();
    assert.equal(sync.phase,'GOODS');
    assert.equal(posts.length,2);
    assert.equal(posts[1].payload[0].group_id,'remote-burger');
    await processAqsiCatalog();
    assert.match(sync.error!,/Тестовая ошибка товаров/);
    assert.equal(posts.length,2,'a rejected batch must not be resubmitted indefinitely');
    rejected=false;
    await processAqsiCatalog();
    assert.equal(sync.phase,'IDLE','provider-trimmed product names must confirm the existing snapshot');
    assert.equal(sync.syncedRevision,sync.revision);
    assert.equal(sync.error,null);
  } finally {globalThis.fetch=original;}
});
