// Isolated embedded PostgreSQL only; never connects to DATABASE_URL.
// Set INVENTORY_TEST_PGLITE_MODULE to an installed @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import type {PoolClient} from 'pg';
import {applyStockOperation,type StockOperationInput} from '../src/lib/inventoryOperations';

test('migrations and transactional stock operations in isolated PostgreSQL',async()=>{
  const modulePath=process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath,'Set INVENTORY_TEST_PGLITE_MODULE; this test never uses the application DB.');
  const {PGlite}=await import(pathToFileURL(modulePath).href);
  const db=new PGlite();
  try{
    await db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT); INSERT INTO users VALUES (\'tester\',\'Tester\',NULL)');
    for(const file of ['zz_inventory_mvp.sql','zz_inventory_recipes.sql','zz_inventory_audit_access.sql','zz_inventory_stock_operations.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
    // New migration may safely be rerun by a manual migration process.
    await db.exec(await readFile(new URL('../migrations/zz_inventory_stock_operations.sql',import.meta.url),'utf8'));
    const raw=randomUUID(),goods=randomUUID(),prepared=randomUUID();
    for(const [id,kind,unit] of [[raw,'RAW','g'],[goods,'PURCHASED','pcs'],[prepared,'PREPARED','pcs']])await db.query('INSERT INTO inventory_items(id,name,kind,unit) VALUES($1,$2,$3,$4)',[id,kind,kind,unit]);
    const apply=(input:StockOperationInput)=>db.transaction(async (tx:{query:(sql:string,params:unknown[])=>Promise<{rows:unknown[];affectedRows:number}>})=>applyStockOperation({query:async(sql:string,params:unknown[])=>{const result=await tx.query(sql,params);return {...result,rowCount:result.rows.length||result.affectedRows};}} as unknown as PoolClient,'tester',input));
    const operation=(itemId:string,reason:StockOperationInput['reason'],quantity:string,expectedQuantity?:string):StockOperationInput=>({operationId:randomUUID(),itemId,reason,quantity,expectedQuantity,note:'Контрольная операция'});
    const opening=operation(raw,'OPENING','1000');
    assert.equal((await apply(opening)).replayed,false);
    assert.equal((await apply({...opening,quantity:'1000.000'})).replayed,true);
    await assert.rejects(apply({...opening,quantity:'1001'}),/OPERATION_CONFLICT/);
    await assert.rejects(apply(operation(raw,'OPENING','1')),/OPENING_EXISTS/);
    await apply(operation(raw,'RECEIPT','500,025'));
    await apply(operation(raw,'WRITE_OFF','50.025'));
    await assert.rejects(apply(operation(raw,'WRITE_OFF','1450.001')),/STOCK_INSUFFICIENT/);
    await assert.rejects(apply(operation(raw,'RECOUNT','1040','1000')),/STOCK_CHANGED/);
    await apply(operation(raw,'RECOUNT','1040','1450'));
    await apply(operation(raw,'RECOUNT','1040','1040'));
    await apply(operation(goods,'OPENING','10'));
    await assert.rejects(apply(operation(goods,'RECEIPT','0.5')),/QUANTITY_INVALID/);
    await assert.rejects(apply(operation(prepared,'RECEIPT','1')),/USE_PRODUCTION/);
    await apply(operation(goods,'RECOUNT','0','10'));
    await assert.rejects(apply(operation(goods,'OPENING','1')),/OPENING_EXISTS/);
    const result=await db.query('SELECT quantity::text FROM inventory_items WHERE id=$1',[raw]);
    assert.equal(result.rows[0].quantity,'1040.000');
    const history=await db.query('SELECT count(*)::int AS count FROM inventory_movements WHERE item_id=$1',[raw]);
    assert.equal(history.rows[0].count,5);
    const operations=await db.query('SELECT count(*)::int AS count FROM inventory_operations');
    assert.equal(operations.rows[0].count,7,'failed operations rolled back with their keys');
    const authors=await db.query("SELECT count(*)::int AS count FROM inventory_operations WHERE actor_user_id='tester'");
    assert.equal(authors.rows[0].count,7);
    const audit=await db.query("SELECT count(*)::int AS count FROM inventory_audit_events WHERE action='MOVEMENT' AND actor_user_id='tester'");
    assert.equal(audit.rows[0].count,7,'movement audit retains the authenticated actor');
    await assert.rejects(db.exec('DELETE FROM inventory_audit_events'),/append-only/);
    const nonempty=await db.query('UPDATE inventory_items SET is_active=false WHERE id=$1 AND quantity=0 AND is_active=true RETURNING id',[raw]);
    assert.equal(nonempty.rows.length,0,'nonzero stock cannot be archived');
    const archived=await db.query('UPDATE inventory_items SET is_active=false,updated_at=NOW() WHERE id=$1 AND quantity=0 AND is_active=true RETURNING id',[goods]);
    assert.equal(archived.rows.length,1,'used zero-stock item can be removed from the catalog');
    assert.equal((await db.query('SELECT id FROM inventory_items WHERE id=$1 AND is_active=true',[goods])).rows.length,0);
    assert.equal((await db.query('SELECT id FROM inventory_movements WHERE item_id=$1',[goods])).rows.length,2,'archival preserves movements');
    await assert.rejects(apply(operation(goods,'RECEIPT','1')),/ITEM_NOT_FOUND/);
  }finally{await db.close();}
});
