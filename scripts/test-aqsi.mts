import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiptPositions,receiptOrderReference,parsePurchaseResult,parseReceiptResult } from '../src/lib/aqsiReceipt';
const options={taxSystemCode:1,taxRateId:6,calculationTypeId:4,calculationSubjectId:1};

test('receipt reference fits the 16-byte terminal field and distinguishes orders',()=>{
  const orderId='42c6c91d-4164-47c5-baf6-0905700a42c4';
  const reference=receiptOrderReference(orderId);
  assert.equal(Buffer.byteLength(reference,'utf8'),16);
  assert.match(reference,/^B[A-Za-z0-9_-]{15}$/);
  assert.equal(receiptOrderReference(orderId),reference);
  assert.notEqual(receiptOrderReference('42c6c91d-4164-47c5-baf6-0905700a42c5'),reference);
});

test('receipt matches paid total exactly after discounts and bonus rounding',()=>{
  for(let total=1;total<=13001;total+=137) {
    const positions=receiptPositions([{productId:'coffee',name:'Кофе — 400 мл; +молоко',quantity:3,unitPrice:30.01},{productId:'bowl',name:'Боул',quantity:2,unitPrice:50.01}],total,options);
    assert.equal(positions.reduce((sum,p)=>sum+p.info.finalPrice*Number(p.info.baseQuantity),0),total);
    assert.equal(positions.reduce((sum,p)=>sum+Number(p.info.baseQuantity),0),5);
    assert.ok(positions.every(p=>Number.isInteger(p.info.finalPrice) && p.info.finalPrice>=0));
  }
});
test('receipt uses stored name and variant external ID',()=>{
  const [p]=receiptPositions([{productId:'coffee',variantId:'large',name:'Старое название — большой',quantity:1,unitPrice:10}],1000,options);
  assert.equal(p.externalId,'belok:large');assert.equal(p.info.name,'Старое название — большой');assert.equal(p.info.taxRateId,6);
});
test('invalid amounts and quantities are rejected',()=>{
  assert.throws(()=>receiptPositions([{productId:'x',name:'x',quantity:1,unitPrice:1}],101,options));
  assert.throws(()=>receiptPositions([{productId:'x',name:'x',quantity:1.5,unitPrice:1}],100,options));
});
test('purchase success requires matching amount, transaction type and bank result',()=>{
  const result={id:'slip-1',content:{type:'purchase',amount:1000,responseCode:'000'}};
  assert.deepEqual(parsePurchaseResult(JSON.stringify(result),1000),result);
  assert.throws(()=>parsePurchaseResult(JSON.stringify(result),1001));
  assert.throws(()=>parsePurchaseResult(JSON.stringify({...result,content:{...result.content,responseCode:'05'}}),1000));
  assert.throws(()=>parsePurchaseResult(JSON.stringify({...result,content:{...result.content,type:'refund'}}),1000));
  assert.throws(()=>parsePurchaseResult(null,1000));
});
test('receipt confirmation requires a fiscal sale for this order and exact amount',()=>{
  const payload={info:{additionalAttribute:'order-1'},payments:[{amount:1000}]};
  const result={id:'receipt-1',isNonFiscal:false,info:{typeId:1,sum:1000,additionalAttribute:'order-1'}};
  assert.deepEqual(parseReceiptResult(JSON.stringify(result),payload),result);
  assert.throws(()=>parseReceiptResult(JSON.stringify({...result,isNonFiscal:true}),payload));
  assert.throws(()=>parseReceiptResult(JSON.stringify({...result,info:{...result.info,sum:999}}),payload));
  assert.throws(()=>parseReceiptResult(JSON.stringify({...result,info:{...result.info,additionalAttribute:'other-order'}}),payload));
});
