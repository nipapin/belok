import assert from 'node:assert/strict';
import 'dotenv/config';
import {createHmac} from 'node:crypto';
import puppeteer from 'puppeteer';

// All API requests are intercepted: this test never saves real fiscal settings
// or requests a receipt/catalog operation on a physical terminal.
const base=process.env.BASE_URL||'http://localhost:3000';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Use only a local test server');
const browser=await puppeteer.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try {
  const page=await browser.newPage();await page.setBypassServiceWorker(true);
  // A synthetic, nonexistent session passes the proxy's signature check. The
  // actual auth and admin APIs below are mocked, with no real account/session.
  const sessionId='aqsi-browser-test-nonexistent-session';
  const signature=createHmac('sha256',process.env.SESSION_SECRET||process.env.JWT_SECRET).update(sessionId).digest('hex');
  await browser.setCookie({name:'belok_session',value:sessionId+'.'+signature,url:base});
  let config={enabled:true,deviceId:784146,receiptsEnabled:true,catalogEnabled:false,taxSystemCode:1,taxRateId:6,calculationTypeId:4,calculationSubjectId:1,cashierName:''};
  const actions=[];
  const serverVersion={revision:'new-server-release',builtAt:'2026-10-10T14:00:00Z'};
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    const respond=body=>request.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/api/auth/me')return void respond({user:{id:'test-admin',role:'ADMIN',name:'Тест',bonusBalance:0,totalSpent:0}});
    if(path==='/api/admin/version')return void respond(serverVersion);
    if(path==='/api/admin/aqsi') {
      if(request.method()==='PUT'){config=JSON.parse(request.postData());return void respond({config})}
      if(request.method()==='POST'){actions.push(JSON.parse(request.postData()));return void respond({ok:true})}
      return void respond({config,keyConfigured:true,catalog:null,jobs:[{id:'failed-receipt',orderId:'order',dailyNumber:663,kind:'RECEIPT',state:'FAILED',operationId:'provider-operation',error:'Указана недопустимая СНО',submittedAt:'2026-10-10T14:43:41Z',payload:{deviceId:784146,info:{taxSystemCode:1},payments:[{type:1,amount:62500}]}}]});
    }
    if(path.startsWith('/api/'))return void respond({orders:[],notifications:[],settings:{},configured:true});
    void request.continue();
  });
  await page.goto(base+'/admin/settings',{waitUntil:'networkidle2'});
  await page.waitForSelector('::-p-text(Касса aQsi)');
  await page.waitForSelector('button::-p-text(Обновить админку)');
  assert.ok(await page.$eval('[data-admin-build-version]',element=>element.textContent.includes('На сервере другая сборка')));
  await page.evaluate(()=>{
    const label=[...document.querySelectorAll('label')].find(e=>e.textContent.startsWith('Система налогообложения'));
    label.querySelector('select').id='test-aqsi-sno';
  });
  const click=async text=>{const button=await page.waitForSelector(`button::-p-text(${text})`);await button.click()};
  const value=()=>page.$eval('#test-aqsi-sno',select=>select.value);
  const requestDetails=await page.waitForSelector('summary::-p-text(Последний запрос в aQsi)');await requestDetails.click();
  const requestJson=await page.$eval('details pre',element=>JSON.parse(element.textContent));
  assert.equal(requestJson.info.taxSystemCode,1,'request must show the saved sent payload');
  assert.equal(requestJson.payments[0].amount,62500);
  assert.equal(await page.$eval('details',element=>element.textContent.includes('/v4/Receipts/process')),true);
  await page.select('#test-aqsi-sno','2');
  await click('Проверить операции');
  await page.waitForFunction(()=>document.body.innerText.includes('Действие выполнено'));
  assert.equal(await value(),'2','operation check must preserve unsaved fiscal settings');
  assert.equal(await page.$eval('details pre',element=>JSON.parse(element.textContent).info.taxSystemCode),1,'editing config must not rewrite sent request history');
  assert.equal(config.taxSystemCode,1,'operation check must not save or replace fiscal settings');
  const retryDisabled=await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Чек не создан')).disabled);
  assert.equal(retryDisabled,true,'receipt retry must wait for fiscal settings to be saved');
  await click('Синхронизировать каталог');
  await page.waitForFunction(()=>document.body.innerText.includes('Действие выполнено'));
  assert.equal(await value(),'2','catalog action must preserve draft');
  await click('Сохранить aQsi');
  await page.waitForFunction(()=>document.body.innerText.includes('Настройки сохранены'));
  assert.equal(config.taxSystemCode,2);
  assert.equal(await value(),'2');
  assert.deepEqual(actions.map(a=>a.action),['process','sync']);
  console.log('PASS: operation/catalog actions preserve fiscal draft; save persists it; retry is blocked until saved');
}finally{await browser.close()}
