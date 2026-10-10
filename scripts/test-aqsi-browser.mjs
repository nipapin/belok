import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
const base=process.env.BASE_URL || 'http://localhost:3018';
const browser=await puppeteer.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
try {
  const page=await browser.newPage();await page.setViewport({width:768,height:1024});
  await page.setBypassServiceWorker(true);
  let paymentStatus='PENDING';let receiptState='QUEUED';let orders=0;let lastBody;
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
    if(path==='/api/kiosk/orders/test-order/payment') return void respond({paymentStatus,terminalState:paymentStatus==='PENDING'?'PROCESSING':'SUCCEEDED',receiptState});
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
} finally {await browser.close()}
