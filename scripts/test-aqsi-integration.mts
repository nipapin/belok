import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync,readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Pool } from 'pg';

// Explicit opt-in; use only a dedicated test schema. All aQsi traffic is mocked.
test('durable aQsi queue, parallel workers, receipts and uncertain submissions',{skip:!process.env.AQSI_TEST_DATABASE_URL},async()=>{
  const schema=`aqsi_test_${randomUUID().replaceAll('-','')}`;
  const admin=new Pool({connectionString:process.env.AQSI_TEST_DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
  const originalFetch=globalThis.fetch;
  let db:typeof import('../src/lib/db')|undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const url=new URL(process.env.AQSI_TEST_DATABASE_URL!);
    url.searchParams.set('options',`-c search_path=${schema}`);
    process.env.DATABASE_URL=url.toString();process.env.AQSI_API_KEY='test-only';process.env.AQSI_DEVICE_ID='784146';
    db=await import('../src/lib/db');
    // PostgreSQL advisory locks are shared across schemas. Give test locks a
    // separate namespace so a live worker cannot skip a mocked test tick.
    const lockNamespace=1+parseInt(schema.slice(-7),16);
    db.pool.on('connect',client=>{
      const originalQuery=client.query;
      client.query=((text:unknown,...args:unknown[])=>Reflect.apply(originalQuery,client,[
        typeof text==='string' ? text.replaceAll('(784146,',`(${lockNamespace},`) : text,...args,
      ])) as typeof client.query;
    });
    for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort()) await db.query(readFileSync(`migrations/${name}`,'utf8').replaceAll("'public'",`'${schema}'`).replaceAll('public.',`"${schema}".`));
    await db.query(`INSERT INTO app_settings (key,value) VALUES ('aqsi',$1),('notification_settings',$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,[
      JSON.stringify({enabled:true,deviceId:784146,receiptsEnabled:true,catalogEnabled:false,taxSystemCode:1,taxRateId:6,calculationTypeId:4,calculationSubjectId:1,cashierName:''}),JSON.stringify({adminNewOrdersPush:false,autoPushLoyalty:false})]);
    await db.query(`INSERT INTO categories (id,name) VALUES ('cat','Меню'); INSERT INTO products (id,name,price,"categoryId") VALUES ('p','Новое имя',10,'cat')`);
    const {enqueueCard,processAqsiJobs,cancelAqsiCard,retryAqsiReceipt}=await import('../src/lib/aqsiJobs');
    const {applyTbankPaymentStatus}=await import('../src/lib/tbankPayments');
    const {processAqsiCatalog}=await import('../src/lib/aqsiCatalog');
    let ticket=0;
    async function order(id:string,method='CARD') {
      await db!.query(`INSERT INTO orders (id,total,source,"paymentMethod","dailyNumber") VALUES ($1,10,'KIOSK',$2,$3)`,[id,method,++ticket]);
      await db!.query(`INSERT INTO order_items (id,"orderId","productId",quantity,"unitPrice","fiscalName") VALUES ($1,$2,'p',1,10,'Сохранённое имя')`,[randomUUID(),id]);
      if(method==='CARD') await db!.withTransaction(client=>enqueueCard(client,id,10,784146));
    }
    let posts=0;let fail=false;const operations=new Map<string,{type:string;status:string;result:string|null;message?:string;problems?:string}>();
    const payloads:Record<string,unknown>[]=[];
    globalThis.fetch=async(input,init)=>{
      const path=new URL(String(input)).pathname;
      if(init?.method==='POST') {
        if(path.endsWith('/cancel')) return Response.json({operationId:path.split('/').at(-2)});
        posts++;if(fail)throw new Error('lost response');
        const payload=JSON.parse(String(init.body));payloads.push(payload);
        const id=randomUUID();const card=path.includes('purchase');
        operations.set(id,{type:card?'acquiring.purchase':'receipt.process',status:'Pending',result:null});
        return Response.json({operationId:id});
      }
      const op=operations.get(path.split('/').pop()!);assert.ok(op);
      return Response.json({operationId:path.split('/').pop(),deviceId:784146,...op});
    };
    await order('paid-card');
    await Promise.all([processAqsiJobs(),processAqsiJobs()]);assert.equal(posts,1);
    const first=await db.queryOne<{operationId:string}>(`SELECT "operationId" FROM aqsi_jobs WHERE "orderId"='paid-card'`);assert.ok(first);
    operations.set(first.operationId,{type:'acquiring.purchase',status:'Completed',result:JSON.stringify({id:'slip',content:{type:'purchase',amount:1000,responseCode:'000'}})});
    await processAqsiJobs();assert.equal(posts,2);
    assert.equal((await db.queryOne<{paymentStatus:string}>(`SELECT "paymentStatus" FROM orders WHERE id='paid-card'`))?.paymentStatus,'SUCCEEDED');
    assert.equal((payloads[1].positions as {info:{name:string}}[])[0].info.name,'Сохранённое имя');
    const receiptInfo=payloads[1].info as {additionalAttribute:string;additionalUserAttribute:{name:string;value:string}};
    assert.equal(Buffer.byteLength(receiptInfo.additionalAttribute,'utf8'),16);
    assert.equal(receiptInfo.additionalUserAttribute.value,'#1');
    const receipt=await db.queryOne<{operationId:string;submittedAt:Date}>(`SELECT "operationId","submittedAt" FROM aqsi_jobs WHERE "orderId"='paid-card' AND kind='RECEIPT'`);assert.ok(receipt);
    assert.ok(receipt.submittedAt instanceof Date,'record actual submission attempt time');
    operations.set(receipt.operationId,{type:'receipt.process',status:'Completed',result:JSON.stringify({id:'receipt',isNonFiscal:false,info:{typeId:1,sum:1000,additionalAttribute:(payloads[1].info as {additionalAttribute:string}).additionalAttribute}})});
    await processAqsiJobs();await processAqsiJobs();assert.equal(posts,2);
    await order('sbp','SBP');
    await Promise.all([applyTbankPaymentStatus('sbp','CONFIRMED'),applyTbankPaymentStatus('sbp','CONFIRMED')]);
    assert.equal((await db.query<{id:string}>(`SELECT id FROM aqsi_jobs WHERE "orderId"='sbp' AND kind='RECEIPT'`)).length,1);
    await processAqsiJobs();const sbpReceipt=await db.queryOne<{id:string;operationId:string}>(`SELECT id,"operationId" FROM aqsi_jobs WHERE "orderId"='sbp'`);assert.ok(sbpReceipt);
    operations.set(sbpReceipt.operationId,{type:'receipt.process',status:'Error',result:null,problems:'Unexpected',message:'Указана недопустимая СНО'});
    await processAqsiJobs();
    assert.match((await db.queryOne<{error:string}>('SELECT error FROM aqsi_jobs WHERE id=$1',[sbpReceipt.id]))!.error,/Указана недопустимая СНО/);
    await db.query(`UPDATE app_settings SET value=jsonb_set(value,'{taxSystemCode}','2') WHERE key='aqsi'`);
    assert.equal(await retryAqsiReceipt(sbpReceipt.id),true);
    assert.equal((await db.queryOne<{submittedAt:Date|null}>(`SELECT "submittedAt" FROM aqsi_jobs WHERE id=$1`,[sbpReceipt.id]))?.submittedAt,null);
    const retryBefore=posts;
    await processAqsiJobs();await processAqsiJobs();assert.equal(posts,retryBefore+1);
    assert.equal((payloads.at(-1)!.info as {taxSystemCode:number}).taxSystemCode,2,'retry must rebuild using corrected fiscal settings');
    assert.equal(await retryAqsiReceipt(sbpReceipt.id),false,'processing receipt must never be submitted again');
    const retried=await db.queryOne<{operationId:string}>(`SELECT "operationId" FROM aqsi_jobs WHERE id=$1`,[sbpReceipt.id]);assert.ok(retried);
    assert.notEqual(retried.operationId,sbpReceipt.operationId);
    operations.set(retried.operationId,{type:'receipt.process',status:'Completed',result:JSON.stringify({id:'sbp-receipt',isNonFiscal:false,info:{typeId:1,sum:1000,additionalAttribute:(payloads.at(-1)!.info as {additionalAttribute:string}).additionalAttribute}})});await processAqsiJobs();
    assert.equal(await retryAqsiReceipt(sbpReceipt.id),false,'successful receipt must never be submitted again');
    await order('cancel-race');await processAqsiJobs();await cancelAqsiCard('cancel-race');
    assert.equal((await db.queryOne<{paymentStatus:string}>(`SELECT "paymentStatus" FROM orders WHERE id='cancel-race'`))?.paymentStatus,'PENDING','requesting cancellation is not confirmation');
    const racing=await db.queryOne<{operationId:string}>(`SELECT "operationId" FROM aqsi_jobs WHERE "orderId"='cancel-race'`);assert.ok(racing);
    operations.set(racing.operationId,{type:'acquiring.purchase',status:'Completed',result:JSON.stringify({id:'racing-slip',content:{type:'purchase',amount:1000,responseCode:'000'}})});await processAqsiJobs();
    assert.equal((await db.queryOne<{paymentStatus:string}>(`SELECT "paymentStatus" FROM orders WHERE id='cancel-race'`))?.paymentStatus,'SUCCEEDED');
    const racingReceipt=await db.queryOne<{operationId:string}>(`SELECT "operationId" FROM aqsi_jobs WHERE "orderId"='cancel-race' AND kind='RECEIPT'`);assert.ok(racingReceipt);
    const racingPayload=payloads.at(-1)!;
    operations.set(racingReceipt.operationId,{type:'receipt.process',status:'Completed',result:JSON.stringify({id:'racing-receipt',isNonFiscal:false,info:{typeId:1,sum:1000,additionalAttribute:(racingPayload.info as {additionalAttribute:string}).additionalAttribute}})});await processAqsiJobs();
    await order('uncertain');fail=true;const before=posts;
    await processAqsiJobs();await processAqsiJobs();assert.equal(posts,before+1);
    assert.equal((await db.queryOne<{state:string}>(`SELECT state FROM aqsi_jobs WHERE "orderId"='uncertain'`))?.state,'UNKNOWN');
    assert.equal((await db.queryOne<{paymentStatus:string}>(`SELECT "paymentStatus" FROM orders WHERE id='uncertain'`))?.paymentStatus,'PENDING');
    await order('next-card');await processAqsiJobs();assert.equal(posts,before+1,'unknown result must block next terminal payment');
    await db.query(`UPDATE aqsi_jobs SET state='FAILED' WHERE "orderId"='uncertain'`);fail=false;
    await processAqsiJobs();assert.equal(posts,before+2);
    const next=await db.queryOne<{operationId:string}>(`SELECT "operationId" FROM aqsi_jobs WHERE "orderId"='next-card'`);assert.ok(next);
    operations.set(next.operationId,{type:'acquiring.purchase',status:'Timeout',result:null});await processAqsiJobs();
    assert.equal((await db.queryOne<{paymentStatus:string}>(`SELECT "paymentStatus" FROM orders WHERE id='next-card'`))?.paymentStatus,'CANCELLED');
    const oldRevision=(await db.queryOne<{revision:string}>('SELECT revision FROM aqsi_catalog_sync'))?.revision;
    await db.query(`UPDATE products SET price=11 WHERE id='p'`);
    assert.notEqual((await db.queryOne<{revision:string}>('SELECT revision FROM aqsi_catalog_sync'))?.revision,oldRevision);
    await processAqsiCatalog(); // Disabled: must never upload catalog.
    assert.equal(posts,before+2);
    await order('expired');await db.query(`UPDATE aqsi_jobs SET "createdAt"=NOW()-INTERVAL '3 minutes' WHERE "orderId"='expired'`);await processAqsiJobs();
    assert.equal(posts,before+2,'expired queued cards must never be submitted');
    assert.equal((await db.queryOne<{paymentStatus:string}>(`SELECT "paymentStatus" FROM orders WHERE id='expired'`))?.paymentStatus,'CANCELLED');
    // Bulk upsert and verification, including disabling a deleted site product.
    await db.query(`UPDATE app_settings SET value=jsonb_set(value,'{catalogEnabled}','true') WHERE key='aqsi'`);
    let categories:Record<string,unknown>[]=[];
    const goods=new Map<string,Record<string,unknown>>();
    let uploads=0;
    globalThis.fetch=async(input,init)=>{
      const path=new URL(String(input)).pathname;
      if(init?.method==='POST') {
        assert.ok(init.body instanceof FormData);
        const file=init.body.get('file');assert.ok(file instanceof Blob);
        const bulk=JSON.parse(gunzipSync(new Uint8Array(await file.arrayBuffer())).toString());
        assert.equal(bulk.removeObsolete,false);
        uploads++;
        if(path.endsWith('ListGoodsCategories')) categories=bulk.payload;
        else for(const good of bulk.payload) goods.set(good.id,good);
        return Response.json({guid:randomUUID()});
      }
      if(path.endsWith('GoodsCategory/list')) return Response.json(categories);
      const good=goods.get(decodeURIComponent(path.split('/').pop()!));assert.ok(good);return Response.json(good);
    };
    await processAqsiCatalog();await processAqsiCatalog();await processAqsiCatalog();
    assert.equal(uploads,2);assert.equal(goods.get('belok:p')?.price,11);
    assert.equal((await db.queryOne<{phase:string}>('SELECT phase FROM aqsi_catalog_sync'))?.phase,'IDLE');
    await db.query(`DELETE FROM order_items; DELETE FROM products WHERE id='p'`);
    await processAqsiCatalog();await processAqsiCatalog();await processAqsiCatalog();
    assert.equal(goods.get('belok:p')?.nonTradable,true);
  } finally {
    globalThis.fetch=originalFetch;
    if(db) await db.pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
