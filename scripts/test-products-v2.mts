import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseRecipeDraft, recipeDraftInput} from '../src/lib/recipeDraft';
import {validateRecipe} from '../src/lib/inventoryRecipes';
import {calculateAvailability,cartStockAvailability,type StockRequirement} from '../src/lib/inventoryAvailability';

test('unfinished recipes survive draft recovery without becoming usable production recipes',()=>{
  const draft={outputQuantity:'20',outputUnit:'pcs' as const,instructions:'Выпекать 15 минут',lines:[{itemId:'flour',quantity:''}]};
  const saved={version:1,updatedAt:Date.now(),draft};
  assert.deepEqual(parseRecipeDraft(JSON.stringify(saved))?.draft,draft);
  assert.throws(()=>recipeDraftInput(draft),/количества/);
  assert.equal(parseRecipeDraft('{broken'),null);
  assert.equal(parseRecipeDraft(JSON.stringify({...saved,draft:{...draft,lines:[...draft.lines,...draft.lines]}})),null);
  assert.equal(parseRecipeDraft(JSON.stringify({...saved,version:2})),null);
});
test('comma quantities and precise thousandths can be saved as a finished recipe',()=>{
  const parsed=recipeDraftInput({outputQuantity:'20',outputUnit:'pcs',instructions:'',lines:[{itemId:'flour',quantity:'1,001'}]});
  assert.equal(parsed.lines[0].quantity,1.001);
  assert.doesNotThrow(()=>validateRecipe({ownerKind:'PREPARED',ownerId:'bun',...parsed}));
  assert.throws(()=>recipeDraftInput({outputQuantity:'0',outputUnit:'pcs',instructions:'',lines:[]}));
  assert.throws(()=>recipeDraftInput({outputQuantity:'1',outputUnit:'pcs',instructions:'',lines:[{itemId:'a',quantity:'0.0001'}]}));
});
const line=(stockKnown:boolean,quantity='0'):StockRequirement=>({itemId:'bun',name:'Булочка',unit:'pcs',required:'1',quantity,active:true,stockKnown});
test('creating catalog entries does not put existing menu into automatic stop before stocktaking',()=>{
  assert.equal(calculateAvailability([line(false)]).state,'UNCONFIGURED');
  assert.equal(calculateAvailability([line(true)]).state,'STOP');
  assert.equal(calculateAvailability([line(true,'3')]).portions,3);
  const requirements=new Map([['draft-product',[line(false)]],['counted-product',[line(true)]]]);
  assert.equal(cartStockAvailability([{productId:'draft-product',quantity:1},{productId:'counted-product',quantity:1}],requirements).state,'STOP');
});

test('real catalog API creates names without movements and distinguishes zero after inventory',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {pathToFileURL}=await import('node:url');
  const {randomUUID}=await import('node:crypto');
  const vm=await import('node:vm');
  const ts=await import('typescript');
  const {NextRequest,NextResponse}=await import('next/server');
  const stock=await import('../src/lib/inventoryStock');
  const {applyStockOperation}=await import('../src/lib/inventoryOperations');
  const modulePath=process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath,'Use isolated PGlite only');
  const {PGlite}=await import(pathToFileURL(modulePath).href);
  const db=new PGlite();
  type Tx={query:(sql:string,params?:unknown[])=>Promise<{rows:Record<string,unknown>[];affectedRows:number}>};
  const client=(tx:Tx)=>({query:async(sql:string,params?:unknown[])=>{const r=await tx.query(sql,params);return {...r,rowCount:r.rows.length||r.affectedRows}}});
  try{
    await db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('tester')");
    for(const file of ['zz_inventory_mvp.sql','zz_inventory_recipes.sql','zz_inventory_images.sql','zz_inventory_audit_access.sql','zz_inventory_stock_operations.sql','zz_inventory_unspecified_kind.sql'])
      await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
    const code=ts.transpileModule(await readFile(new URL('../src/app/api/admin/inventory/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const routes={} as {GET:()=>Promise<Response>;POST:(req:InstanceType<typeof NextRequest>)=>Promise<Response>};
    const modules:Record<string,unknown>={
      'next/server':{NextResponse},'node:crypto':{randomUUID},'@/lib/inventoryStock':stock,
      '@/lib/inventoryAccess':{requireInventoryPermission:async()=>({id:'tester'})},
      '@/lib/inventoryMetadata':{},
      '@/lib/db':{query:async(sql:string,params?:unknown[])=>(await db.query(sql,params)).rows,
        withTransaction:(fn:(tx:ReturnType<typeof client>)=>Promise<unknown>)=>db.transaction((tx:Tx)=>fn(client(tx)))},
    };
    vm.runInNewContext(code,{exports:routes,require:(name:string)=>{assert.ok(name in modules,name);return modules[name]},URL,console});
    const post=(body:unknown)=>routes.POST(new NextRequest('http://test/api/admin/inventory',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}));
    const response=await post({name:'Тунец',kind:'RAW',unit:'g'});
    assert.equal(response.status,201);
    const {item}=await response.json();
    assert.equal(item.stockKnown,false);
    assert.equal(Number(item.quantity),0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM inventory_movements')).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM inventory_operations')).rows[0].n,0);
    assert.equal((await post({name:'Другая позиция',kind:'RAW',unit:'g',quantity:5})).status,400);
    assert.equal((await post({name:'Тунец',kind:'RAW',unit:'g'})).status,409);
    assert.equal((await (await routes.GET()).json()).items[0].stockKnown,false);
    await db.transaction((tx:Tx)=>applyStockOperation(client(tx) as never,'tester',{operationId:randomUUID(),itemId:item.id,reason:'RECOUNT',quantity:'0',expectedQuantity:'0',note:'Первичная инвентаризация'}));
    const counted=(await (await routes.GET()).json()).items[0];
    assert.equal(counted.stockKnown,true);
    assert.equal(Number(counted.quantity),0);
  }finally{await db.close()}
});
