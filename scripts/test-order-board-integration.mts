// Actual read/mutation SQL runs only against embedded PostgreSQL, never DATABASE_URL.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import * as boardQuery from '../src/lib/orderBoardQuery';
import * as groups from '../src/lib/orderItemGroups';
import * as titles from '../src/lib/productTitle';

test('pending payments are visible, cash collection is explicit and atomic, online payments cannot be confirmed manually', async () => {
  const modulePath = process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath, 'Set INVENTORY_TEST_PGLITE_MODULE; production DB is never accessed');
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TYPE "OrderStatus" AS ENUM ('PENDING','CONFIRMED','PREPARING','READY','COMPLETED','CANCELLED');
      CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','SUCCEEDED','CANCELLED','FAILED','REFUNDED');
      CREATE TABLE orders(id text PRIMARY KEY,"dailyNumber" int,status "OrderStatus",source text,fulfillment text,"paymentMethod" text,
        "paymentStatus" "PaymentStatus",total numeric,comment text,"deliveryAddress" text,"deliveryTime" text,
        "createdAt" timestamp,"updatedAt" timestamp,"userId" text);
      CREATE TABLE app_settings(key text PRIMARY KEY,value jsonb);
      CREATE TABLE aqsi_jobs(id text PRIMARY KEY,"orderId" text,kind text,state text);
      CREATE TABLE aqsi_cash_orders(id text PRIMARY KEY,"orderId" text,state text);
      CREATE TABLE products(id text PRIMARY KEY,name text);
      CREATE TABLE ingredients(id text PRIMARY KEY,name text);
      CREATE TABLE order_items(id text PRIMARY KEY,"orderId" text,"productId" text,"parentItemId" text,
        quantity int,"preparedQuantity" int DEFAULT 0,"variantName" text);
      CREATE TABLE order_item_customizations(id text PRIMARY KEY,"orderItemId" text,action text,"ingredientName" text,"ingredientId" text);
      INSERT INTO products VALUES('dish','Боул'),('topping','Авокадо');
      INSERT INTO ingredients VALUES('onion','Лук');`);
    const insert = async (id: string, status = 'PENDING', payment = 'SUCCEEDED', method: string | null = 'CASH', date = "CURRENT_TIMESTAMP AT TIME ZONE 'UTC'") => {
      await db.query(`INSERT INTO orders(id,"dailyNumber",status,"paymentStatus","paymentMethod","createdAt",total)
        VALUES($1,1,$2,$3,$4,${date},300)`, [id,status,payment,method]);
      await db.query(`INSERT INTO order_items(id,"orderId","productId",quantity) VALUES($1,$2,'dish',1)`, ['item-'+id,id]);
    };
    for (const status of ['PENDING','CONFIRMED','PREPARING','READY']) {
      await insert('paid-'+status, status);
      for (const payment of ['PENDING','CANCELLED','FAILED','REFUNDED']) {
        for (const method of ['CASH','CARD','SBP','BONUS',null]) await insert(`${status}-${payment}-${method}`,status,payment,method);
      }
    }
    await insert('paid-bonus','PENDING','SUCCEEDED','BONUS');
    await insert('paid-cancelled','CANCELLED'); await insert('paid-completed','COMPLETED');
    await insert('yesterday','PENDING','SUCCEEDED','CASH',"(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 day'");
    await insert('tomorrow','PENDING','SUCCEEDED','CASH',"(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'");
    await db.exec(`INSERT INTO order_items(id,"orderId","productId","parentItemId",quantity) VALUES('topping','paid-PREPARING','topping','item-paid-PREPARING',1);
      INSERT INTO order_item_customizations VALUES('remove','item-paid-PREPARING','REMOVE',NULL,'onion');`);
    let canComplete = true; let authorized = true; let queries = 0;
    class KioskUnauthorizedError extends Error {}
    const query = async (sql: string, params?: unknown[]) => { queries++; return (await db.query(sql,params)).rows; };
    const modules: Record<string, unknown> = {
      'next/server': { NextRequest, NextResponse, after: () => {} },
      '@/lib/db': { query, queryOne: async (sql: string, params?: unknown[]) => (await query(sql,params))[0],
        withTransaction: (fn: (client: unknown) => unknown) => db.transaction(fn) },
      '@/lib/kioskAuth': { KioskUnauthorizedError }, '@/lib/kioskCookie': { KIOSK_COOKIE: 'test' },
      '@/lib/orderBoardAccess': { requireBoardAccess: async () => { if (!authorized) throw new KioskUnauthorizedError(); return { canComplete, user: { id: 'cashier' } }; } },
      '@/lib/orderBoardQuery': boardQuery, '@/lib/orderItemGroups': groups, '@/lib/productTitle': titles,
      '@/lib/orderLoyalty': { settleOrderLoyalty: async () => {} }, '@/lib/notificationSettings': {}, '@/lib/push': {},
    };
    async function load(path: string) {
      const source = await readFile(new URL('../'+path,import.meta.url),'utf8');
      const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
      const exports: Record<string, (...args: unknown[]) => Promise<Response>> = {};
      vm.runInNewContext(code,{exports,require:(name:string)=>{ assert.ok(name in modules, name); return modules[name]; },Map,console:{...console,error:()=>{}}});
      return exports;
    }
    const list = await load('src/app/api/order-board/route.ts');
    const statuses = await load('src/app/api/order-board/[id]/status/route.ts');
    const items = await load('src/app/api/order-board/[id]/items/[itemId]/route.ts');
    const status = (id: string, next: string, confirmCash?: unknown) => statuses.PATCH(new NextRequest('http://test',{method:'PATCH',body:JSON.stringify({status:next,...(confirmCash !== undefined ? {confirmCash} : {})})}),{params:Promise.resolve({id})});
    const mark = (id: string, preparedQuantity = 0, action = 'prepare') => items.PATCH(new NextRequest('http://test',{method:'PATCH',body:JSON.stringify({action,preparedQuantity})}),{params:Promise.resolve({id,itemId:'item-'+id})});
    const response = await list.GET();
    assert.equal(response.status,200); assert.equal(queries,3,'One bounded query per related table');
    const orders = (await response.json()).orders;
    assert.deepEqual(orders.map((o:{id:string})=>o.id).sort(),['paid-PENDING','paid-CONFIRMED','paid-PREPARING','paid-READY','paid-bonus', ...['PENDING','CONFIRMED'].flatMap(s => ['CASH','CARD','SBP'].map(m => `${s}-PENDING-${m}`))].sort());
    assert.equal(orders.find((o:{id:string})=>o.id==='PENDING-PENDING-CASH').requiresCashConfirmation,true);
    for (const method of ['CARD','SBP']) {
      const pending = orders.find((o:{id:string})=>o.id==='PENDING-PENDING-'+method);
      assert.equal(pending.awaitingPayment,true); assert.equal(pending.requiresCashConfirmation,false);
      assert.equal(pending.pendingPaymentMethod,method);
    }
    const cooking = orders.find((o:{id:string})=>o.id==='paid-PREPARING');
    assert.equal(cooking.items.length,1); assert.equal(cooking.items[0].customizations.length,2);
    assert.equal(cooking.items[0].customizations[0].name,'Лук');
    canComplete = false;
    const cookOrders = (await (await list.GET()).json()).orders;
    assert.equal('paymentStatus' in cookOrders[0],false); assert.equal('total' in cookOrders[0],false);
    assert.equal((await status('paid-READY','COMPLETED')).status,403);
    assert.equal((await status('PENDING-PENDING-CASH','PREPARING',true)).status,403,'Cook cannot attest to collected money');
    canComplete = true;
    for (const id of ['PENDING-PENDING-CASH','PENDING-PENDING-BONUS','PENDING-PENDING-null','paid-cancelled','yesterday']) {
      assert.equal((await status(id,'PREPARING')).status,409,id);
    }
    assert.equal((await status('READY-PENDING-CASH','COMPLETED')).status,409,'Unpaid ready card cannot be issued');
    for (const method of ['CARD','SBP']) assert.equal((await status('PENDING-PENDING-'+method,'PREPARING',true)).status,409,'Online payment cannot be manually marked paid');
    assert.equal((await status('PENDING-PENDING-CASH','READY',true)).status,400);
    assert.equal((await status('PENDING-PENDING-CASH','PREPARING','true')).status,400);
    await db.exec(`INSERT INTO aqsi_cash_orders VALUES('deferred','PENDING-PENDING-CASH','WAITING');`);
    const acceptedCash = await status('PENDING-PENDING-CASH','PREPARING',true);
    assert.equal(acceptedCash.status,200);
    assert.equal((await acceptedCash.json()).order.paymentStatus,'SUCCEEDED');
    assert.equal((await status('PENDING-PENDING-CASH','PREPARING',true)).status,409,'Retry cannot accept the same order twice');
    assert.equal((await db.query("SELECT value FROM app_settings WHERE key='cash_payment:PENDING-PENDING-CASH'")).rows[0].value.actorId,'cashier');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM app_settings')).rows[0].n,1);
    assert.equal((await db.query('SELECT state FROM aqsi_cash_orders')).rows[0].state,'WAITING','Cash attestation never resubmits the terminal receipt');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM aqsi_jobs')).rows[0].n,0,'No new acquiring or receipt operation');
    await db.exec(`INSERT INTO aqsi_jobs VALUES('uncertain-card','CONFIRMED-PENDING-CASH','CARD','UNKNOWN');`);
    assert.equal((await status('CONFIRMED-PENDING-CASH','PREPARING',true)).status,409,'Uncertain card charge must be reconciled first');
    await db.exec(`UPDATE aqsi_jobs SET state='FAILED';`);
    assert.equal((await status('CONFIRMED-PENDING-CASH','PREPARING',true)).status,200,'Confirmed failed card allows actual cash collection');
    await db.exec(`UPDATE orders SET "paymentStatus"='SUCCEEDED' WHERE id='PENDING-PENDING-CARD';`);
    assert.equal((await status('PENDING-PENDING-CARD','PREPARING')).status,200,'Bank success unlocks normal acceptance');
    const paidCard = (await (await list.GET()).json()).orders.find((o:{id:string})=>o.id==='PENDING-PENDING-CARD');
    assert.equal(paidCard.awaitingPayment,false);
    // If the audit write fails, both acceptance and paid status roll back.
    await db.exec('ALTER TABLE app_settings RENAME TO audit_unavailable');
    const failedAudit = await status('PENDING-PENDING-SBP','PREPARING',true);
    assert.equal(failedAudit.status,409);
    await insert('cash-rollback');
    await db.exec(`UPDATE orders SET "paymentStatus"='PENDING' WHERE id='cash-rollback';`);
    assert.equal((await status('cash-rollback','PREPARING',true)).status,500);
    const rollback = (await db.query(`SELECT status,"paymentStatus" FROM orders WHERE id='cash-rollback'`)).rows[0];
    assert.equal(rollback.status,'PENDING'); assert.equal(rollback.paymentStatus,'PENDING');
    await db.exec('ALTER TABLE audit_unavailable RENAME TO app_settings');

    assert.equal((await status('paid-PENDING','PREPARING')).status,200);
    assert.equal((await mark('paid-PENDING')).status,200);
    assert.equal((await status('paid-PENDING','COMPLETED')).status,200);
    for (const id of ['PREPARING-PENDING-CASH','PREPARING-CANCELLED-CARD','paid-cancelled']) assert.equal((await mark(id)).status,409);
    await db.exec(`UPDATE orders SET "paymentStatus"='CANCELLED' WHERE id='paid-PREPARING'`);
    assert.equal((await mark('paid-PREPARING')).status,409,'Payment changed after card was loaded');
    assert.equal((await status('paid-PREPARING','READY')).status,409);
    assert.equal((await (await list.GET()).json()).orders.some((o:{id:string})=>o.id==='paid-PREPARING'),false);
    authorized = false; const before = queries;
    assert.equal((await list.GET()).status,401); assert.equal(queries,before); authorized = true;

    // Exact Kaliningrad midnight; session/database timezone must not move the day.
    const boundaries = boardQuery.boardTodaySql.replaceAll('CURRENT_TIMESTAMP',"TIMESTAMPTZ '2026-11-01T23:30:00Z'");
    for (const timezone of ['UTC','America/New_York','Asia/Tokyo']) {
      await db.exec(`SET TIME ZONE '${timezone}'`);
      const dates = await db.query(`SELECT "createdAt"::text AS t FROM (VALUES
        (TIMESTAMP '2026-11-01 21:59:59.999'),(TIMESTAMP '2026-11-01 22:00:00'),
        (TIMESTAMP '2026-11-02 21:59:59.999'),(TIMESTAMP '2026-11-02 22:00:00')) AS d("createdAt") WHERE ${boundaries}`);
      assert.deepEqual(dates.rows.map((r:{t:string})=>r.t),['2026-11-01 22:00:00','2026-11-02 21:59:59.999']);
    }
    await db.exec(`SET TIME ZONE 'UTC'; INSERT INTO orders(id,status,"paymentStatus","createdAt",total)
      SELECT 'history-'||i,'PREPARING','SUCCEEDED',(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '2 days' - i * INTERVAL '1 minute',100
      FROM generate_series(1,50000) i; ANALYZE orders;`);
    const oldSql = `SELECT id FROM orders WHERE status IN ('PENDING','CONFIRMED','PREPARING','READY') AND ${boardQuery.boardPaymentSql}
      AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kaliningrad')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kaliningrad')::date ORDER BY "createdAt" DESC,"dailyNumber" DESC NULLS LAST,id DESC`;
    const newSql = `SELECT id FROM orders WHERE status IN ('PENDING','CONFIRMED','PREPARING','READY') AND ${boardQuery.boardPaymentSql} AND ${boardQuery.boardTodaySql} ORDER BY "createdAt" DESC,"dailyNumber" DESC NULLS LAST,id DESC`;
    const explain = async (sql: string) => (await db.query('EXPLAIN (ANALYZE, FORMAT JSON) '+sql)).rows[0]['QUERY PLAN'][0];
    const oldPlan = await explain(oldSql);
    const migration = await readFile(new URL('../migrations/029_order_board_indexes.sql',import.meta.url),'utf8');
    await db.exec(migration); await db.exec(migration); await db.exec('ANALYZE orders');
    await db.exec(await readFile(new URL('../migrations/030_order_board_pending_payment_index.sql',import.meta.url),'utf8'));
    const queueSql = newSql.replace(boardQuery.boardPaymentSql, boardQuery.boardQueuePaymentSql);
    const queuePlan = await explain(queueSql);
    assert.match(JSON.stringify(queuePlan),/orders_board_pending_payment_createdAt_idx/);
    assert.match(JSON.stringify(queuePlan),/orders_board_paid_createdAt_idx/);
    const newPlan = await explain(newSql);
    assert.match(JSON.stringify(newPlan),/orders_board_paid_createdAt_idx/,'Large history uses the board index');
    assert.deepEqual((await db.query(oldSql)).rows,(await db.query(newSql)).rows);
    console.log(`50k historical orders: original date filter ${oldPlan['Execution Time']} ms; indexed range ${newPlan['Execution Time']} ms (embedded PostgreSQL)`);
  } finally { await db.close(); }
});
