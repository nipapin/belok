import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

async function load(path: string, modules: Record<string, unknown>, env: Record<string, string | undefined> = {}) {
  const source = await readFile(new URL('../'+path,import.meta.url),'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports: Record<string,()=>Promise<void>> = {};
  vm.runInNewContext(code,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},process:{env,cwd:()=>process.cwd()},console});
  return exports;
}

test('release startup waits for approved migration; build, development and unrelated migrations are excluded',async()=>{
  let calls = 0; let fail = false;
  const modules = {'@/lib/orderBoardMigration':{applyOrderBoardIndexes:async()=>{calls++;if(fail)throw Error('index failure');}}};
  const env={NEXT_RUNTIME:'nodejs',NODE_ENV:'production',RELEASE_ID:'a'.repeat(40)+'-40-1'};
  await (await load('src/instrumentation.ts',modules,env)).register(); assert.equal(calls,1);
  for(const override of [{NEXT_PHASE:'phase-production-build'},{NODE_ENV:'development'},{NEXT_RUNTIME:'edge'},{RELEASE_ID:''}]) {
    await (await load('src/instrumentation.ts',modules,{...env,...override})).register();
  }
  assert.equal(calls,1);
  fail=true; await assert.rejects((await load('src/instrumentation.ts',modules,env)).register,/index failure/);
});

test('board migration applies once, verifies all indexes, and rolls back failure without marking applied',async()=>{
  const modulePath=process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath,'Embedded PostgreSQL is required; production DB is never accessed');
  const {PGlite}=await import(pathToFileURL(modulePath).href);const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE orders(id text,"createdAt" timestamp,"dailyNumber" int,"paymentStatus" text,status text);
      CREATE TABLE order_items(id text,"orderId" text);
      CREATE TABLE order_item_customizations(id text,"orderItemId" text);`);
    const runner=await load('src/lib/orderBoardMigration.ts',{
      'node:fs/promises':{readFile},'node:path':await import('node:path'),
      '@/lib/db':{withTransaction:(fn: (client: unknown)=>unknown)=>db.transaction(fn)},
    });
    await runner.applyOrderBoardIndexes();await runner.applyOrderBoardIndexes();
    assert.equal((await db.query('SELECT count(*)::int AS count FROM _migrations')).rows[0].count,1);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname='public'")).rows[0].count,4);
    await db.exec(`DELETE FROM _migrations;
      DROP INDEX "orders_board_paid_createdAt_idx";DROP INDEX "order_items_orderId_id_idx";DROP INDEX "order_item_customizations_orderItemId_id_idx";
      ALTER TABLE order_item_customizations RENAME TO unavailable;`);
    await assert.rejects(runner.applyOrderBoardIndexes,/does not exist/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM _migrations')).rows[0].count,0);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname='public'")).rows[0].count,1,'Earlier index creation rolled back too');
    await db.exec('ALTER TABLE unavailable RENAME TO order_item_customizations');
    await runner.applyOrderBoardIndexes();
    await db.exec('DROP INDEX "orders_board_paid_createdAt_idx"');
    await assert.rejects(runner.applyOrderBoardIndexes,/missing or invalid/,'An applied marker alone cannot pass readiness');
  }finally{await db.close();}
});
