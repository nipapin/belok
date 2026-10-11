import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import type {PoolClient} from 'pg';
import {assertInventoryMetadataChange} from '../src/lib/inventoryMetadata';
import {applyStockOperation} from '../src/lib/inventoryOperations';
import type {InventoryKind,InventoryUnit} from '../src/lib/inventoryStock';

test('deferred classification preserves stock, links and audit; production and unit changes stay guarded',async()=>{
  const modulePath=process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath,'Set INVENTORY_TEST_PGLITE_MODULE; this test never uses the application DB.');
  const {PGlite}=await import(pathToFileURL(modulePath).href);
  const db=new PGlite();
  type Tx={query:(sql:string,params:unknown[])=>Promise<{rows:Record<string,unknown>[];affectedRows:number}>};
  const adapter=(tx:Tx)=>({query:async(sql:string,params:unknown[])=>{
    const r=await tx.query(sql,params);return {...r,rowCount:r.rows.length||r.affectedRows};
  }}) as PoolClient;
  try{
    await db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('tester'); CREATE TABLE products(id TEXT PRIMARY KEY); INSERT INTO products VALUES('product')");
    for(const file of ['zz_inventory_mvp.sql','zz_inventory_recipes.sql','zz_inventory_product_links.sql','zz_inventory_audit_access.sql','zz_inventory_stock_operations.sql','zz_inventory_unspecified_kind.sql'])
      await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../migrations/zz_inventory_unspecified_kind.sql',import.meta.url),'utf8'));
    const id=randomUUID();
    await db.query("INSERT INTO inventory_items(id,name,unit) VALUES($1,'Быстрая запись','pcs')",[id]);
    assert.equal((await db.query('SELECT kind FROM inventory_items WHERE id=$1',[id])).rows[0].kind,'UNSPECIFIED');
    await db.transaction((tx:Tx)=>applyStockOperation(adapter(tx),'tester',{operationId:randomUUID(),itemId:id,reason:'OPENING',quantity:'10',note:'Начальный остаток'}));
    const change=(kind:InventoryKind,unit:InventoryUnit='pcs')=>db.transaction(async(tx:Tx)=>{
      const client=adapter(tx);
      await client.query("SELECT set_config('belok.actor_user_id',$1,true)",['tester']);
      assert.equal(await assertInventoryMetadataChange(client,id,kind,unit),true);
      await client.query('UPDATE inventory_items SET kind=$2,unit=$3 WHERE id=$1',[id,kind,unit]);
    });
    for(const kind of ['RAW','PACKAGING','PURCHASED','UNSPECIFIED'] as const)await change(kind);
    await assert.rejects(change('RAW','g'),/UNIT_REFERENCED/);
    await db.query('INSERT INTO inventory_product_links(product_id,item_id,quantity) VALUES($1,$2,1)',['product',id]);
    await change('PURCHASED');
    await assert.rejects(change('PREPARED'),/PREPARED_LINKED/);
    await db.query('DELETE FROM inventory_product_links WHERE item_id=$1',[id]);
    await change('PREPARED');
    const recipe=randomUUID();
    await db.query("INSERT INTO inventory_recipes(id,owner_kind,owner_id,output_quantity,output_unit) VALUES($1,'PREPARED',$2,1,'pcs')",[recipe,id]);
    await assert.rejects(change('RAW'),/PREPARED_REFERENCED/);
    await db.query('DELETE FROM inventory_recipes WHERE id=$1',[recipe]);
    await db.query('INSERT INTO inventory_batches(id,prepared_item_id,output_quantity) VALUES($1,$2,1)',[randomUUID(),id]);
    await assert.rejects(change('UNSPECIFIED'),/PREPARED_REFERENCED/);
    assert.equal((await db.query('SELECT quantity::text FROM inventory_items WHERE id=$1',[id])).rows[0].quantity,'10.000');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM inventory_movements WHERE item_id=$1',[id])).rows[0].n,1);
    const audit=await db.query("SELECT count(*)::int AS n FROM inventory_audit_events WHERE item_id=$1 AND action='UPDATE' AND actor_user_id='tester' AND before_state->>'kind' IS DISTINCT FROM after_state->>'kind'",[id]);
    assert.equal(audit.rows[0].n,6);
    await assert.rejects(db.query("UPDATE inventory_items SET kind='UNKNOWN' WHERE id=$1",[id]));
  }finally{await db.close();}
});
