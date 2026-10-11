import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stockMilli,stockDecimal,stockNext,MAX_STOCK_MILLI} from '../src/lib/inventoryStock';

test('exact quantities, comma input and integral pieces',()=>{
  assert.equal(stockMilli('0,029','g'),29);
  assert.equal(stockMilli('1.000','pcs'),1000);
  assert.equal(stockDecimal(stockNext(stockMilli('0.1','g'),stockMilli('0.2','g'),'RECEIPT')),'0.3');
  assert.equal(stockDecimal(-29),'-0.029');
  for(const value of ['',null,true,-1,'1.0001','1e3','NaN','999999999.001']) assert.throws(()=>stockMilli(value,'g'),/QUANTITY_INVALID/);
  assert.throws(()=>stockMilli('1.5','pcs'),/QUANTITY_INVALID/);
});
test('stock limits and recount to zero',()=>{
  assert.throws(()=>stockNext(1000,1001,'WRITE_OFF'),/STOCK_INSUFFICIENT/);
  assert.throws(()=>stockNext(MAX_STOCK_MILLI,1,'RECEIPT'),/STOCK_LIMIT/);
  assert.throws(()=>stockNext(0,0,'OPENING'),/QUANTITY_POSITIVE/);
  assert.equal(stockNext(1000,0,'RECOUNT'),0);
});
