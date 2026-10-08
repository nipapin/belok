/** UI regression check with isolated API fixtures; does not modify the database. */
import assert from 'node:assert/strict';
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import puppeteer from 'puppeteer';

const base = process.env.BASE_URL || 'http://localhost:3000';
const category = { id: 'spiciness-test', name: 'Тестовое меню', image: null, _count: { products: 4 } };
const products = [0, 1, 2, 3].map((spicinessLevel) => ({
  id: `spiciness-${spicinessLevel}`, name: `Блюдо ${spicinessLevel}`, price: 300,
  description: null, image: null, categoryId: category.id, category,
  isAvailable: true, sortOrder: spicinessLevel, spicinessLevel,
  calories: null, proteins: null, fats: null, carbs: null, fiber: null, weightGrams: null,
  ingredients: [], variants: [], createdAt: '2020-01-01T00:00:00.000Z',
}));
let savedBody;
let savedMethod;
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  await page.setBypassServiceWorker(true);
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  assert.ok(secret, 'SESSION_SECRET or JWT_SECRET is required for the test session cookie');
  const signature = createHmac('sha256', secret).update('spiciness-test').digest('hex');
  await page.setCookie({ name: 'belok_session', value: `spiciness-test.${signature}`, url: base });
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return request.abort();
    if (!url.pathname.startsWith('/api/')) return request.continue();
    let data = {};
    if (url.pathname === '/api/auth/me') {
      data = { user: { id: 'test-admin', name: 'Администратор', role: 'ADMIN', email: 'test@example.invalid', bonusBalance: 0, totalSpent: 0, loyaltyLevel: null } };
    } else if (url.pathname.includes('categories')) {
      data = { categories: [category] };
    } else if (url.pathname === '/api/kiosk/session') {
      data = { configured: true, unlocked: true };
    } else if (url.pathname === '/api/home-layout') {
      data = { config: { blocks: [{ id: 'test-products', type: 'products', title: 'Меню', enabled: true, mode: 'latest', limit: 4, productIds: [], layout: 'grid' }] } };
    } else if (url.pathname.includes('/products')) {
      if (['PUT', 'POST'].includes(request.method())) {
        savedBody = JSON.parse(request.postData());
        savedMethod = request.method();
        products[3].spicinessLevel = savedBody.spicinessLevel;
      }
      data = /\/products\/[^/]+$/.test(url.pathname) ? { product: products[3] } : { products };
    } else if (url.pathname.includes('ingredients')) {
      data = { ingredients: [] };
    } else if (url.pathname.includes('orders')) {
      data = { orders: [] };
    }
    return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 900 });
    for (const route of ['/menu', '/kiosk']) {
      console.log(`Checking ${route} at ${width}px`);
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.food-card');
      const counts = await page.$$eval('.food-card', (cards) => cards.map((card) => card.querySelectorAll('[role="img"] svg').length));
      assert.deepEqual(counts, [0, 1, 2, 3], `${route} at ${width}px`);
    }
  }
  console.log('PASS: menu and kiosk render 0–3 peppers on mobile and desktop');

  await page.goto(`${base}/menu/spiciness-3`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[role="img"]');
  assert.equal(await page.$$eval('[role="img"] svg', (icons) => icons.length), 3);

  // Native radio focus must stay inside the form's scroll container on mobile.
  for (const width of [375, 390, 500, 1440]) {
    await page.setViewport({ width, height: 820, isMobile: width < 768, hasTouch: width < 768 });
    await page.goto(`${base}/admin/products/spiciness-3/edit`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name="spicinessLevel"]');
    await page.$eval('input[name="spicinessLevel"]', (input) => input.closest('fieldset').scrollIntoView({ block: 'center' }));
    const position = () => page.evaluate(() => {
      const main = document.querySelector('.admin-surface main');
      const fieldset = document.querySelector('input[name="spicinessLevel"]').closest('fieldset');
      return { windowY: window.scrollY, mainY: main.getBoundingClientRect().top, mainScroll: main.scrollTop, sectionY: fieldset.getBoundingClientRect().top };
    });
    for (const level of [0, 1, 2, 3, 0]) {
      const before = await position();
      const selector = `label:has(input[name="spicinessLevel"][value="${level}"])`;
      if (width < 768) {
        await page.tap(selector);
      } else {
        await page.click(selector);
      }
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const after = await position();
      assert.equal(await page.$eval('input[name="spicinessLevel"]:checked', (input) => Number(input.value)), level);
      for (const key of Object.keys(before)) {
        assert.ok(Math.abs(after[key] - before[key]) <= 1, `Selecting ${level} at ${width}px moves ${key}: ${JSON.stringify({ before, after })}`);
      }
    }
  }
  console.log('PASS: touch and mouse selection keep the admin form in place at 375, 390, 500 and 1440px');
  await page.setViewport({ width: 1440, height: 900, isMobile: false, hasTouch: false });

  for (const level of [2, 0, 1, 3]) {
    await page.goto(`${base}/admin/products/spiciness-3/edit`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name="spicinessLevel"]');
    const loaded = await page.$eval('input[name="spicinessLevel"]:checked', (input) => Number(input.value));
    assert.equal(loaded, products[3].spicinessLevel, 'edit form restores saved spiciness');
    await page.click(`label:has(input[name="spicinessLevel"][value="${level}"])`);
    savedBody = undefined;
    await page.click('button[aria-label="Сохранить"]');
    await page.waitForFunction(() => location.pathname === '/admin/products');
    assert.equal(savedMethod, 'PUT');
    assert.equal(savedBody.spicinessLevel, level);
  }
  console.log('PASS: admin restores, changes and clears spiciness in the save payload');

  await page.goto(`${base}/admin/products/new`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[name="spicinessLevel"]');
  assert.equal(await page.$eval('input[name="spicinessLevel"]:checked', (input) => Number(input.value)), 0);
  await page.type('input[required]:not([type="number"])', 'Новое блюдо');
  await page.type('input[required][type="number"]', '200');
  await page.select('select', category.id);
  await page.click('label:has(input[name="spicinessLevel"][value="3"])');
  savedBody = undefined;
  await page.click('button[aria-label="Создать"]');
  await page.waitForFunction(() => location.pathname === '/admin/products');
  assert.equal(savedMethod, 'POST');
  assert.equal(savedBody.spicinessLevel, 3);
  console.log('PASS: new products default to no peppers and submit the selected level');
} finally {
  await browser.close();
}
