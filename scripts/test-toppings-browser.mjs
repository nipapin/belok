import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const base = process.env.TOPPINGS_TEST_URL ?? 'http://localhost:3104';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname), 'Local sandbox only');
const sessionId = 'toppings-local-session';
const cookie = `${sessionId}.${createHmac('sha256', process.env.SESSION_SECRET ?? 'toppings-local-check-only').update(sessionId).digest('hex')}`;
const original = ['toppings-local-sourcream','toppings-local-jam','toppings-local-honey','toppings-local-stopped'];
const browser = await puppeteer.launch({ headless:'shell', pipe:true, args:['--no-sandbox'] });
await mkdir('output/toppings-qa', {recursive:true});
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({width:1440,height:1000});
  await page.setBypassServiceWorker(true);
  await page.setCookie({name:'belok_session',value:cookie,url:base});
  const go = (path) => page.goto(base + path, {waitUntil:'networkidle0'});
  const clickText = async (selector, text) => {
    const elements = await page.$$(selector);
    for (const element of elements) if ((await element.evaluate((node) => node.textContent)).includes(text)) { await element.click(); return; }
    throw Error(`Missing ${selector}: ${text}`);
  };
  const cart = () => page.evaluate(() => JSON.parse(localStorage.getItem('belok-cart') ?? '{"state":{"items":[]}}').state.items);
  const expectCart = async (expected) => {
    await page.waitForFunction((count) => JSON.parse(localStorage.getItem('belok-cart') ?? '{"state":{"items":[]}}').state.items.length === count, {}, expected.length);
    const items = await cart();
    assert.deepEqual(items.map((item) => [item.productId,item.quantity]).sort(), expected.sort());
  };
  const addDish = async () => {
    await page.waitForSelector('[aria-label="Добавить Сырники в корзину"], [aria-label="Добавить ещё Сырники"]');
    await page.waitForFunction(() => { const button = document.querySelector('[aria-label="Добавить Сырники в корзину"], [aria-label="Добавить ещё Сырники"]'); return button && !button.disabled; });
    const button = await page.$('[aria-label="Добавить Сырники в корзину"]') ?? await page.$('[aria-label="Добавить ещё Сырники"]');
    assert.ok(button, 'Syrniki add button'); await button.click();
    await page.waitForSelector('dialog[open]');
    assert.equal(await page.$eval('dialog[open]', (dialog) => getComputedStyle(dialog).color), 'rgb(32, 43, 40)', 'Portal must retain readable dark text on its light surface');
  };
  const choose = (name) => clickText('dialog[open] .topping-choice', name);

  await go('/admin/products/toppings-local-syrniki/edit');
  await page.waitForSelector('[aria-labelledby="product-toppings-title"] input');
  await page.waitForFunction(() => document.querySelectorAll('[aria-labelledby="product-toppings-title"] input:checked').length === 4);
  await page.screenshot({path:'output/toppings-qa/admin-desktop.png',fullPage:true});
  await page.$$eval('[aria-labelledby="product-toppings-title"] input', (inputs) => { for (const input of inputs) if (input.checked) input.click(); });
  await clickText('[aria-labelledby="product-toppings-title"] label','Сметана');
  await clickText('[aria-labelledby="product-toppings-title"] label','Мёд');
  await page.click('button[aria-label="Сохранить"]');
  await page.waitForFunction(() => location.pathname === '/admin/products');
  await go('/admin/products/toppings-local-syrniki/edit');
  await page.waitForFunction(() => document.querySelectorAll('[aria-labelledby="product-toppings-title"] input:checked').length === 2);
  const checkedLabels = await page.$$eval('[aria-labelledby="product-toppings-title"] label', (labels) => labels.filter((label) => label.querySelector('input').checked).map((label) => label.innerText));
  assert.ok(checkedLabels.some((label) => label.includes('Мёд')) && checkedLabels.some((label) => label.includes('Сметана')));
  await fetch(base + '/api/admin/products/toppings-local-syrniki', {method:'PUT',headers:{cookie:'belok_session='+cookie,'Content-Type':'application/json'},body:JSON.stringify({toppingIds:original})});

  await go('/menu');
  await page.evaluate(() => localStorage.removeItem('belok-cart'));
  await go('/menu');
  await addDish();
  assert.ok(!(await page.$eval('dialog[open]', (dialog) => dialog.innerText)).includes('Шоколад'));
  await page.keyboard.press('Escape');
  assert.equal((await cart()).length,0,'Cancel does not add the dish');
  await addDish(); await choose('Сметана'); await choose('Джем');
  assert.match(await page.$eval('dialog[open] .btn-primary', (button) => button.innerText), /380/);
  await page.$eval('dialog[open] .btn-primary', (button) => { button.click(); button.click(); });
  await expectCart([['toppings-local-syrniki',1],['toppings-local-sourcream',1],['toppings-local-jam',1]]);
  await addDish(); await choose('Мёд'); await page.click('.toppings-dialog-skip');
  await expectCart([['toppings-local-syrniki',2],['toppings-local-sourcream',1],['toppings-local-jam',1]]);
  await page.click('[aria-label="Добавить Каша в корзину"]');
  assert.equal(await page.$('dialog[open]'),null,'No dialog without configured toppings');

  for (const width of [320,390,1440]) {
    await page.setViewport({width,height:950});
    await addDish(); await choose('Сметана');
    assert.equal(await page.$eval('dialog[open]', (dialog) => dialog.scrollWidth <= dialog.clientWidth),true);
    await page.screenshot({path:`output/toppings-qa/menu-${width}.png`});
    await page.keyboard.press('Escape');
  }
  await page.setViewport({width:390,height:950});
  await page.evaluate(() => localStorage.removeItem('belok-cart'));
  await go('/menu/toppings-local-syrniki');
  await page.waitForSelector('[aria-label="Больше"]');
  await page.click('[aria-label="Больше"]');
  await clickText('button','В корзину');
  await page.waitForSelector('dialog[open]'); await choose('Мёд');
  await page.click('dialog[open] .btn-primary');
  await page.waitForFunction(() => location.pathname === '/cart');
  await expectCart([['toppings-local-syrniki',2],['toppings-local-honey',2]]);

  await page.setViewport({width:1080,height:1920});
  await go('/kiosk');
  await page.waitForSelector('[aria-label="Добавить Сырники в корзину"]');
  await addDish(); await choose('Сметана'); await choose('Джем');
  await page.screenshot({path:'output/toppings-qa/kiosk.png'});
  await page.click('dialog[open] .btn-primary');
  await clickText('button','К заказу');
  await page.waitForFunction(() => document.body.innerText.includes('Ваш заказ'));
  assert.deepEqual(await page.$$eval('li.glass-panel > div:nth-child(2) > p:first-child', (nodes) => nodes.map((node) => node.innerText)), ['Сырники','Сметана','Джем']);
  await page.click('[aria-label="Назад к меню"]');
  await page.click('[aria-label^="Открыть Сырники,"]');
  await page.waitForSelector('[role="dialog"] .btn-primary');
  await page.click('[role="dialog"] .btn-primary');
  await page.waitForSelector('dialog[open]');
  await page.click('.toppings-dialog-skip');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]') && !document.querySelector('dialog[open]'));
  assert.deepEqual(errors, []);
  console.log('PASS: admin saves topping choices; menu add, increment, cancel, skip, multiple toppings, double-tap protection; product detail quantity; kiosk cards and product modal; desktop and mobile layout');
} catch (error) {
  const page = (await browser.pages()).at(-1);
  if (page) { await page.screenshot({path:'output/toppings-qa/failure.png'}); console.error(page.url(), await page.$eval('body', (body) => body.innerText.slice(0,1800)), errors); }
  throw error;
} finally {
  await fetch(base + '/api/admin/products/toppings-local-syrniki', {method:'PUT',headers:{cookie:'belok_session='+cookie,'Content-Type':'application/json'},body:JSON.stringify({toppingIds:original})});
  await browser.close();
}
