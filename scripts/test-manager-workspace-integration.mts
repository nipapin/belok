// Runs actual route/stock SQL against isolated embedded PostgreSQL; never uses DATABASE_URL.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';
import * as reports from '../src/lib/managerReports';
import * as availability from '../src/lib/inventoryAvailability';

test('real report, recipe list and availability SQL work against PostgreSQL', async () => {
  const modulePath = process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath, 'Set INVENTORY_TEST_PGLITE_MODULE; application DB is never accessed');
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users(id text PRIMARY KEY);
      CREATE TABLE categories(id text PRIMARY KEY,"isActive" boolean);
      CREATE TABLE products(id text PRIMARY KEY,name text,"weightGrams" numeric,"isCombo" boolean,"isAvailable" boolean,"categoryId" text);
      CREATE TABLE orders(id text PRIMARY KEY,"createdAt" timestamp,"dailyNumber" int,total numeric,"paymentMethod" text,"paymentStatus" text,status text,comment text);
      CREATE TABLE order_items(id text PRIMARY KEY,"orderId" text,"productId" text,"variantName" text,quantity int,"unitPrice" numeric);
      INSERT INTO categories VALUES('cat',true);
      INSERT INTO products VALUES('dish','Боул',200,false,true,'cat'),('drink','Сок',NULL,false,true,'cat');
      INSERT INTO orders VALUES
        ('before','2026-10-10 21:59:59',1,100,'CARD','SUCCEEDED','COMPLETED',NULL),
        ('first','2026-10-10 22:00:00',2,500,'CASH','SUCCEEDED','COMPLETED','Без лука'),
        ('last','2026-10-11 21:59:59.999',3,150,'CARD','PENDING','PENDING',NULL),
        ('after','2026-10-11 22:00:00',4,100,'CARD','SUCCEEDED','COMPLETED',NULL),
        ('cancelled','2026-10-11 10:00:00',5,999,'CARD','CANCELLED','CANCELLED',NULL);
      INSERT INTO order_items VALUES
        ('a','before','dish',NULL,1,100),('b','first','dish',NULL,2,200),('c','first','drink',NULL,1,100),
        ('d','last','drink',NULL,1,150),('e','after','dish',NULL,1,100),('f','cancelled','dish',NULL,1,999);`);
    for (const name of ['zz_inventory_mvp.sql', 'zz_inventory_recipes.sql', 'zz_inventory_product_links.sql', 'zz_inventory_recipe_instructions.sql']) await db.exec(await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8'));
    let authorized = true;
    const query = async (sql: string, params?: unknown[]) => (await db.query(sql, params)).rows;
    const dependencies: Record<string, unknown> = {
      'next/server': { NextResponse },
      '@/lib/adminAuth': { requireAdmin: async () => { if (!authorized) throw Error('UNAUTHORIZED'); } },
      '@/lib/inventoryAccess': { requireInventoryPermission: async () => { if (!authorized) throw Error('UNAUTHORIZED'); } },
      '@/lib/db': { query, queryOne: async (sql: string, params?: unknown[]) => (await query(sql, params))[0], withTransaction: async (fn: (client: unknown) => unknown) => db.transaction((client: unknown) => fn(client)) },
      '@/lib/managerReports': reports,
      './inventoryAvailability': availability,
      '@/lib/inventoryRecipes': {},
    };
    async function load(path: string) {
      const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
      const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
      vm.runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in dependencies, `Unexpected import: ${name}`); return dependencies[name]; }, console, URL, Date, Map });
      return exports;
    }
    const route = await load('src/app/api/admin/reports/route.ts');
    const call = async (extra = '') => await route.GET(new Request('http://test/api/admin/reports?from=2026-10-11&to=2026-10-11' + extra)) as Response;
    const report = await (await call()).json();
    assert.equal(report.summary.orders, 2);
    assert.equal(report.summary.total, 650, 'Order total is not multiplied by item count');
    assert.equal(report.summary.paid, 500);
    assert.equal(report.summary.cashTotal, 500); assert.equal(report.summary.cashPaid, 500);
    assert.equal(report.summary.nonCashTotal, 150); assert.equal(report.summary.nonCashPaid, 0);
    assert.equal(report.summary.otherTotal, 0);
    assert.equal(report.summary.quantity, 4);
    assert.equal(report.rows.length, 3);
    assert.equal(report.rows.find((r: reports.ReportRow) => r.orderId === 'first').comment, 'Без лука');
    assert.equal(report.rows.find((r: reports.ReportRow) => r.orderId === 'first').createdAt, '2026-10-10T22:00:00.000Z');
    const filtered = await (await call('&search=' + encodeURIComponent('Боул'))).json();
    assert.equal(filtered.summary.orders, 1); assert.equal(filtered.summary.quantity, 2); assert.equal(filtered.summary.total, 500);
    assert.equal((await (await call('&payment=CASH')).json()).count, 2);
    assert.equal((await (await call('&cancelled=true')).json()).summary.orders, 3);
    assert.equal((await (await call('&page=2')).json()).rows.length, 0);
    assert.equal((await call('&payment=INVALID')).status, 400);
    assert.equal((await call('&page=0')).status, 400);
    const csv = await call('&format=csv'); assert.ok(csv.headers.get('content-type')?.includes('text/csv')); assert.ok((await csv.text()).includes('Без лука'));
    const itemId = '00000000-0000-4000-8000-000000000001';
    await db.exec(`INSERT INTO inventory_items(id,name,kind,unit,quantity) VALUES('${itemId}','Мука','RAW','g',100);
      INSERT INTO inventory_recipes(id,owner_kind,owner_id,output_quantity,output_unit) VALUES('00000000-0000-4000-8000-000000000002','PRODUCT','dish',2,'pcs');
      INSERT INTO inventory_recipe_lines(id,recipe_id,item_id,quantity) VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','${itemId}',200);`);
    const stock = await load('src/lib/inventoryAvailability.server.ts');
    const result = await stock.loadStockAvailability(['dish', 'drink']) as Map<string, availability.StockAvailability>;
    assert.equal(result.get('dish')?.portions, 1);
    assert.equal(result.get('drink')?.state, 'UNCONFIGURED');
    await db.exec(`UPDATE inventory_items SET quantity=99.999 WHERE id='${itemId}'`);
    const depleted = await stock.loadStockAvailability(['dish']) as Map<string, availability.StockAvailability>;
    assert.equal(depleted.get('dish')?.state, 'STOP');
    const recipeRoute = await load('src/app/api/admin/inventory/recipes/route.ts');
    const recipesResponse = await recipeRoute.GET({ nextUrl: new URL('http://test/api/admin/inventory/recipes') }) as Response;
    const recipeList = await recipesResponse.json();
    assert.equal(recipeList.recipes.length, 2);
    assert.equal(recipeList.recipes.find((r: { ownerId: string }) => r.ownerId === 'dish').lineCount, 1);
    authorized = false; assert.equal((await call()).status, 403);
  } finally { await db.close(); }
});
