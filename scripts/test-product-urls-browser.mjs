import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const base = process.env.TOPPINGS_TEST_URL ?? 'http://localhost:3104';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const id = 'toppings-local-session';
const value = `${id}.${createHmac('sha256',process.env.SESSION_SECRET ?? 'toppings-local-check-only').update(id).digest('hex')}`;
const headers = {cookie:'belok_session='+value,'Content-Type':'application/json'};
const response = await fetch(base+'/api/admin/products',{method:'POST',headers,body:JSON.stringify({name:'Тест адресов',price:100,categoryId:'toppings-local-breakfast',variants:[{name:'Рисовая'},{name:'Овсяная'}]})});
assert.equal(response.status,201);
const {product} = await response.json();
const browser = await puppeteer.launch({headless:'shell',pipe:true,args:['--no-sandbox']});
try {
  const page = await browser.newPage(); const errors=[];
  page.on('pageerror',(error)=>errors.push(error.message));
  await page.setViewport({width:650,height:1050}); await page.setBypassServiceWorker(true);
  await page.setCookie({name:'belok_session',value,url:base});
  const go = (path)=>page.goto(base+path,{waitUntil:'networkidle0'});
  const selected = product.variants[1];
  await go(`/menu/${product.id}?v=${selected.id}&source=test`);
  await page.waitForFunction(({slug,variant})=>location.pathname===`/menu/${slug}`&&new URLSearchParams(location.search).get('v')===variant,{}, {slug:product.slug,variant:selected.slug});
  assert.equal(new URL(page.url()).searchParams.get('source'),'test');
  assert.match(await page.$eval('h1',node=>node.parentElement.innerText),/Овсяная/);
  await page.click('[aria-label="Больше"]');
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const colors=await page.$$eval('.product-gallery-control svg',nodes=>nodes.map(node=>getComputedStyle(node).color));
    assert.equal(colors.length,3);
    assert.ok(colors.every(color=>['rgb(38, 50, 44)','rgb(23, 36, 29)'].includes(color)),JSON.stringify(colors));
    await mkdir('output/toppings-qa',{recursive:true});
    await page.screenshot({path:`output/toppings-qa/gallery-controls-${theme}.png`});
  }
  await page.click('[aria-label="Следующий вариант"]');
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('v')==='risovaya');
  assert.match(await page.$eval('h1',node=>node.parentElement.innerText),/Рисовая/);
  assert.match(await page.$eval('.sticky.bottom-0',node=>node.innerText),/200 ₽/,'Changing the URL must preserve selected quantity');
  await page.click('[aria-label="Предыдущий вариант"]');
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('v')==='ovsyanaya');
  await page.reload({waitUntil:'networkidle0'});
  assert.match(await page.$eval('h1',node=>node.parentElement.innerText),/Овсяная/);
  await go('/menu');
  await page.waitForSelector('[aria-label^="Открыть Тест адресов,"]');
  await page.click('[aria-label^="Открыть Тест адресов,"]');
  await page.waitForFunction(slug=>location.pathname===`/menu/${slug}`,{},product.slug);
  assert.equal(new URL(page.url()).searchParams.get('v'),'risovaya');
  assert.deepEqual(errors,[]);
  console.log('PASS: legacy ID URLs become readable without losing variant or query, gallery arrows update variant URLs without resetting quantity, reload and catalog links work, all overlay icons remain dark in both themes');
} finally {
  await browser.close();
  await fetch(base+'/api/admin/products/'+product.id,{method:'DELETE',headers});
}
