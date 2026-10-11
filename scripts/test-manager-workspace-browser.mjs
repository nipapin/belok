import assert from 'node:assert/strict';
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer';

// API interception isolates the UI test from all real orders and stock.
const base = process.env.BASE_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
assert.ok(secret, 'Local session signing configuration is required');
const browser = await puppeteer.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const output = join(tmpdir(), 'belok-manager-preview');
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await browser.setCookie({ name: 'belok_session', value: 'ui-test.' + createHmac('sha256', secret).update('ui-test').digest('hex'), domain: new URL(base).hostname, path: '/' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  let saved = false;
  let stockStop = true;
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    const path = url.pathname;
    const respond = body => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return void respond({ user: { id: 'test-admin', role: 'ADMIN', name: 'Управляющий', bonusBalance: 0, totalSpent: 0 } });
    if (path === '/api/admin/version') return void respond({ revision: 'test-revision', builtAt: null });
    if (path === '/api/admin/inventory') return void respond({ items: [{ id: 'stock', name: 'Мука', quantity: '50', minQuantity: '100', unit: 'g', kind: 'RAW', isActive: true }] });
    if (path === '/api/admin/inventory/recipes') {
      if (request.method() === 'PUT') { saved = true; return void respond({ ok: true }); }
      if (url.searchParams.has('ownerId')) return void respond({ recipe: { outputQuantity: 1, outputUnit: 'pcs', instructions: '', lines: [{ itemId: 'stock', quantity: 100 }] } });
      return void respond({ recipes: [{ ownerId: 'dish', ownerKind: 'PRODUCT', name: 'Боул', unit: 'pcs', recipeId: 'recipe', lineCount: 1 }, { ownerId: 'drink', ownerKind: 'PRODUCT', name: 'Сок', unit: 'pcs', recipeId: null, lineCount: 0 }] });
    }
    if (path === '/api/admin/inventory/availability') return void respond({ dishes: [{ id: 'dish', name: 'Боул', state: 'STOP', portions: 0, reasons: ['Не хватает: Мука'] }, { id: 'drink', name: 'Сок', state: 'UNCONFIGURED', portions: null, reasons: ['Не задан расход на одну порцию'] }] });
    if (path === '/api/admin/reports') {
      requests.push(url.searchParams);
      return void respond({ page: Number(url.searchParams.get('page')), count: 51, summary: { orders: 25, quantity: 70, total: 15000, paid: 12000 }, rows: [{ id: 'line', orderId: 'order', dailyNumber: 42, createdAt: '2026-10-10T22:00:00Z', productName: 'Боул', variantName: null, quantity: 2, unitPrice: 300, orderTotal: 600, paymentMethod: 'CASH', paymentStatus: 'SUCCEEDED', status: 'COMPLETED', comment: 'Без лука' }] });
    }
    if (path === '/api/products') return void respond({ products: [{ id: 'dish', name: 'Боул', price: 300, image: null, categoryId: 'cat', category: { id: 'cat', name: 'Блюда' }, ingredients: [], variants: [], isAvailable: !stockStop }] });
    if (path === '/api/products/categories') return void respond({ categories: [{ id: 'cat', name: 'Блюда', _count: { products: 1 } }] });
    if (path.startsWith('/api/')) return void respond({ orders: [], notifications: [], settings: {} });
    void request.continue();
  });
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000 });
    for (const route of ['manager', 'recipes', 'reports']) {
      await page.goto(`${base}/admin/${route}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.manager-panel');
      assert.ok(await page.$eval('body', body => body.innerText.includes('Боул')));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No page overflow: ${route} at ${width}`);
      await page.screenshot({ path: join(output, `${route}-${width}.png`), fullPage: true });
      if (route === 'recipes') {
        await page.click('.manager-list-row');
        await page.waitForSelector('button::-p-text(Сохранить техкарту)');
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Сохранить техкарту') && !button.disabled));
        const save = await page.$('button::-p-text(Сохранить техкарту)');
        await save.evaluate(button => button.scrollIntoView({ block: 'center' }));
        await save.click();
        await page.waitForFunction(() => document.body.innerText.includes('Технологическая карта сохранена'));
      }
      if (route === 'reports') {
        await page.click('button::-p-text(2 года)');
        const next = await page.waitForSelector('button::-p-text(Далее)');
        await next.click();
        await page.waitForFunction(() => document.body.innerText.includes('страница 2 из 2'));
      }
    }
  }
  assert.ok(saved, 'Recipe editor is reachable from the standalone section and saves');
  assert.ok(requests.some(p => p.get('page') === '2'), 'Pagination reaches server');
  assert.ok(requests.some(p => (Date.parse(p.get('to')) - Date.parse(p.get('from'))) / 86400000 === 729), 'Two-year preset reaches server');
  await page.goto(`${base}/menu`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.includes('На стопе'));
  assert.equal(await page.$('[aria-label="Добавить Боул в корзину"]'), null);
  stockStop = false;
  await page.waitForSelector('[aria-label="Добавить Боул в корзину"]', { timeout: 15000 });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: standalone recipes, save, manager, multi-year reports, pagination, mobile layout, live stop-list. Previews:', output);
} finally { await browser.close(); }
