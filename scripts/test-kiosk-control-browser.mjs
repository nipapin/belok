import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const base=process.env.BASE_URL||'http://127.0.0.1:3018';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Only a local test server');
const browser=await puppeteer.launch({headless:true});
try {
  const page=await browser.newPage();await page.setViewport({width:768,height:1024});
  await page.setBypassServiceWorker(true);
  let command=null;let paymentStatus='PENDING';const reports=[];const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    const respond=body=>request.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/api/kiosk/session') return void respond({configured:true,unlocked:true,cardEnabled:true});
    if(path==='/api/kiosk/control') {reports.push(JSON.parse(request.postData()));return void respond({command})}
    if(path==='/api/products/categories') return void respond({categories:[{id:'cat',name:'Боулы',isActive:true,sortOrder:0}]});
    if(path==='/api/products') return void respond({products:[{id:'bowl',name:'Тестовый боул',price:100,categoryId:'cat',isAvailable:true,image:null,ingredients:[],variants:[],spicinessLevel:0}]});
    if(path==='/api/kiosk/orders/test-order/payment') return void respond({paymentStatus,terminalState:'PROCESSING',receiptState:'SUCCEEDED'});
    if(path.startsWith('/api/')) return void respond({});
    void request.continue();
  });
  await page.goto(base+'/kiosk',{waitUntil:'networkidle2'});
  await page.waitForSelector('[aria-label^="Версия киоска"]');
  const version=JSON.parse(readFileSync('package.json','utf8')).version;
  assert.equal(await page.$eval('[aria-label^="Версия киоска"]',el=>el.textContent),version);
  assert.ok(await page.$eval('[aria-label^="Версия киоска"]',el=>parseFloat(getComputedStyle(el).fontSize)<=12),'version badge stays small');
  await mkdir('output/aqsi-qa',{recursive:true});
  await page.screenshot({path:'output/aqsi-qa/kiosk-version.png'});
  await page.evaluate(async()=>{
    localStorage.setItem('test-preserved','yes');
    document.cookie='test-preserved=yes; path=/';
    const cache=await caches.open('kiosk-control-stale-test');await cache.put('/stale-test',new Response('old app'));
  });
  const firstId='00000000-0000-4000-8000-000000000001';
  command={id:firstId};
  const firstAck=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/kiosk/control' && JSON.parse(r.postData()).lastRefreshId===firstId,{timeout:45_000});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await firstAck;
  await page.waitForSelector('[aria-label^="Версия киоска"]');
  assert.equal(await page.evaluate(()=>localStorage.getItem('test-preserved')),'yes');
  assert.equal(await page.evaluate(()=>document.cookie.includes('test-preserved=yes')),true);
  assert.equal(await page.evaluate(async()=>(await caches.keys()).includes('kiosk-control-stale-test')),false);
  assert.equal(new URL(page.url()).searchParams.get('_kiosk_refresh'),firstId);
  console.log('PASS: remote refresh clears stale caches, reloads once, preserves login/storage and acknowledges completion');

  await page.evaluate(()=>sessionStorage.setItem('belok:kiosk:payment',JSON.stringify({orderId:'test-order',displayNumber:'123',total:100,guest:true,inviteSent:false,paymentMethod:'CARD',payload:null,image:null})));
  await page.reload({waitUntil:'networkidle2'});
  await page.waitForFunction(()=>document.body.innerText.includes('Приложите карту к терминалу'));
  const secondId='00000000-0000-4000-8000-000000000002';command={id:secondId};
  const busyReport=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/kiosk/control' && JSON.parse(r.postData()).busy===true,{timeout:25_000});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await busyReport;
  assert.equal(await page.evaluate(()=>localStorage.getItem('belok:kiosk:last-refresh')),firstId,'payment defers remote refresh');
  assert.ok(await page.evaluate(()=>sessionStorage.getItem('belok:kiosk:payment')));
  paymentStatus='SUCCEEDED';
  const secondAck=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/kiosk/control' && JSON.parse(r.postData()).lastRefreshId===secondId,{timeout:45_000});
  await secondAck;
  assert.equal(new URL(page.url()).searchParams.get('_kiosk_refresh'),secondId);
  assert.ok(reports.some(report=>report.lastRefreshId===secondId && !report.busy));
  assert.deepEqual(errors,[]);
  console.log('PASS: active payment survives; queued refresh runs after the completed order leaves the screen');
} finally {await browser.close()}
