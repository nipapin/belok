import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
const base=process.env.BASE_URL || 'http://localhost:3018';
const browser=await puppeteer.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
try {
  const page=await browser.newPage();await page.setViewport({width:768,height:1024});
  await page.setBypassServiceWorker(true);
  let paymentStatus='PENDING';let receiptState='QUEUED';let orders=0;let lastBody;
  let terminalState='PROCESSING';let deferredState=null;let cancelIntent=null;
  const cancellationRequests=[];
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    const respond=body=>request.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/api/kiosk/session') return void respond({configured:true,unlocked:true,cardEnabled:true});
    if(path==='/api/products/categories') return void respond({categories:[{id:'cat',name:'Боулы',isActive:true,sortOrder:0}]});
    if(path==='/api/products') return void respond({products:[{id:'bowl',name:'Тестовый боул',price:100,categoryId:'cat',isAvailable:true,image:null,ingredients:[],variants:[],spicinessLevel:0}]});
    if(path==='/api/kiosk/orders') {
      orders++;lastBody=JSON.parse(request.postData());
      return void respond({order:{id:'test-order',total:100,paymentMethod:lastBody.paymentMethod},displayNumber:'123',guest:true,payment:{method:lastBody.paymentMethod}});
    }
    if(path==='/api/kiosk/orders/test-order/payment') {
      if(request.method()==='POST') {
        const body=JSON.parse(request.postData());cancellationRequests.push(body);
        cancelIntent=body.action==='defer'?'DEFER':'CANCEL';
        return void respond({requested:true});
      }
      return void respond({paymentStatus,terminalState:paymentStatus==='SUCCEEDED'?'SUCCEEDED':terminalState,receiptState,deferredState,cancelIntent});
    }
    if(path.startsWith('/api/')) return void respond({});
    void request.continue();
  });
  const text=async label=>{const element=await page.waitForSelector(`::-p-text(${label})`);await element.click()};
  await page.goto(`${base}/kiosk`,{waitUntil:'networkidle2'});
  await page.waitForSelector('[aria-label="Добавить Тестовый боул в корзину"]');
  await page.click('[aria-label="Добавить Тестовый боул в корзину"]');
  await text('К заказу');await text('Карта');
  await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Отправить заказ'));return button && getComputedStyle(button).opacity==='1'});
  await mkdir('output/aqsi-qa',{recursive:true});await page.screenshot({path:'output/aqsi-qa/checkout.png'});
  await text('Отправить заказ');
  await page.waitForFunction(()=>document.body.innerText.includes('Приложите карту к терминалу'));
  assert.equal(lastBody.paymentMethod,'CARD');assert.match(lastBody.requestId,/^[0-9a-f-]{36}$/i);
  assert.equal(orders,1);
  await page.reload({waitUntil:'networkidle2'});
  await page.waitForFunction(()=>document.body.innerText.includes('Приложите карту к терминалу'));
  assert.equal(orders,1,'reload must recover payment without placing another order');
  await page.screenshot({path:'output/aqsi-qa/card-payment.png'});
  paymentStatus='SUCCEEDED';receiptState='SUCCEEDED';
  await page.waitForFunction(()=>document.body.innerText.includes('Заберите чек на терминале'));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('belok:kiosk:payment')),null);
  assert.deepEqual(errors,[]);
  console.log('PASS: card selection, payment screen, reload recovery and receipt confirmation');
  // A request whose response was lost must be replayed even after cart state
  // disappears on reload, using exactly the original request ID and body.
  const draft={requestId:'00000000-0000-4000-8000-000000000001',paymentMethod:'CARD',items:[{productId:'bowl',quantity:1}]};
  await page.evaluate(value=>sessionStorage.setItem('belok:kiosk:request',JSON.stringify(value)),draft);
  await page.reload({waitUntil:'networkidle2'});
  await page.waitForFunction(()=>document.body.innerText.includes('Восстановить заказ'));
  paymentStatus='PENDING';await text('Восстановить заказ');
  await page.waitForFunction(()=>document.body.innerText.includes('Приложите карту к терминалу'));
  assert.deepEqual(lastBody,draft);
  console.log('PASS: lost response recovery uses original request body after reload');
  const placedOrders=orders;
  await text('Оплатить на кассе');
  await page.waitForFunction(()=>document.body.innerText.includes('Готовим оплату на кассе'));
  assert.deepEqual(cancellationRequests,[{action:'defer'}]);
  assert.ok(await page.evaluate(()=>sessionStorage.getItem('belok:kiosk:payment')),'keep pending payment until cancellation is confirmed');
  assert.equal(orders,placedOrders);
  await page.reload({waitUntil:'networkidle2'});
  await page.waitForFunction(()=>document.body.innerText.includes('Готовим оплату на кассе'));
  assert.equal(cancellationRequests.length,1,'reload reads persisted transfer intent without cancelling again');
  // If the first payment wins the cancellation race, show paid, not cashier payment.
  paymentStatus='SUCCEEDED';receiptState='SUCCEEDED';
  await page.waitForFunction(()=>document.body.innerText.includes('Заберите чек на терминале'));
  assert.equal(await page.evaluate(()=>document.body.innerText.includes('Заказ передан в отложенные')),false);
  console.log('PASS: transfer waits for cancellation; reload and successful-payment race are safe');

  async function restoreCard() {
    await page.evaluate(()=>{
      sessionStorage.removeItem('belok:kiosk:request');
      sessionStorage.setItem('belok:kiosk:payment',JSON.stringify({orderId:'test-order',displayNumber:'123',total:100,guest:true,inviteSent:false,paymentMethod:'CARD',payload:null,image:null}));
    });
    await page.reload({waitUntil:'networkidle2'});
  }
  paymentStatus='PENDING';terminalState='FAILED';deferredState='QUEUED';cancelIntent=null;
  await restoreCard();
  await page.waitForFunction(()=>document.body.innerText.includes('Передаём заказ на кассу'));
  assert.equal(await page.evaluate(()=>document.body.innerText.includes('Оплачено')),false);
  deferredState='WAITING';
  await page.waitForFunction(()=>document.body.innerText.includes('Заказ передан в отложенные на кассе'));
  assert.equal(await page.evaluate(()=>document.body.innerText.includes('#123')),true);
  assert.equal(await page.evaluate(()=>document.body.innerText.includes('Оплата на кассе')),true);
  assert.equal(await page.evaluate(()=>document.body.innerText.includes('Оплачено')),false);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('belok:kiosk:payment')),null);
  assert.equal(orders,placedOrders,'fallback preserves the original order without submitting a new basket');
  await page.screenshot({path:'output/aqsi-qa/card-deferred.png'});
  console.log('PASS: failed card transfers the same unpaid order and clears the kiosk for the next guest');

  terminalState='UNKNOWN';deferredState=null;cancelIntent=null;
  await restoreCard();
  await page.waitForFunction(()=>document.body.innerText.includes('Уточняем результат оплаты'));
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Оплатить на кассе'))),false);
  assert.equal(orders,placedOrders);
  assert.deepEqual(errors,[]);
  console.log('PASS: unknown payment cannot request cashier payment');
} finally {await browser.close()}
