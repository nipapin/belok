import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import * as customer from '../src/lib/orderCustomer';
import type { BoardOrder } from '../src/lib/orderBoard';

test('online pending cards wait, cash requires explicit collection, paid cards accept normally', async () => {
  const source = await readFile(new URL('../src/components/orders/OrderBoard.tsx',import.meta.url),'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const modules: Record<string,unknown> = {
    react: React, 'react/jsx-runtime': jsx, 'lucide-react':icons, 'next/link':{},
    '@/components/kiosk/KioskPinPad':{}, '@/lib/orderCustomer':customer, '@/lib/orderBoardSound':{},
  };
  const exports: { OrderCard?: React.ComponentType<Record<string,unknown>> } = {};
  vm.runInNewContext(code+'\nexports.OrderCard = OrderCard;',{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  const order: BoardOrder = {id:'1188',dailyNumber:1188,status:'PENDING',source:'KIOSK',fulfillment:'DINE_IN',
    paymentMethod:'CASH',paymentStatus:'PENDING',total:400,comment:null,deliveryAddress:null,deliveryTime:null,
    createdAt:new Date().toISOString(),items:[],awaitingPayment:true,requiresCashConfirmation:true,pendingPaymentMethod:'CASH'};
  const render = (value: BoardOrder, canComplete = true) => renderToStaticMarkup(React.createElement(exports.OrderCard!,{
    order:value,canComplete,fresh:false,now:Date.now(),busy:false,acknowledge:()=>{},advance:()=>{},markItem:()=>{},
  }));
  const cash = render(order);
  assert.match(cash,/Наличные получены — принять/);assert.match(cash,/400/);assert.doesNotMatch(cash,/disabled/);
  const cook = render(order,false);assert.match(cook,/Ожидает кассира/);assert.match(cook,/disabled/);assert.doesNotMatch(cook,/400/);
  for (const method of ['CARD','SBP'] as const) {
    const waiting = render({...order,paymentMethod:method,pendingPaymentMethod:method,requiresCashConfirmation:false});
    assert.match(waiting,/Ожидает оплаты/);assert.match(waiting,/disabled/);assert.doesNotMatch(waiting,/Наличные получены/);
    const paid = render({...order,paymentMethod:method,paymentStatus:'SUCCEEDED',awaitingPayment:false,requiresCashConfirmation:false});
    assert.match(paid,/Принять/);assert.doesNotMatch(paid,/disabled|Ожидает оплаты|Наличные получены/);
  }
});
