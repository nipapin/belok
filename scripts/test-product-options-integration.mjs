/** Actual API and browser tests against a newly created schema in LOCAL PostgreSQL only. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, createWriteStream } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';
import pg from 'pg';
import puppeteer from 'puppeteer';

dotenv.config({ quiet: true });
const url = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!process.env.TEST_DATABASE_URL) url.hostname = '127.0.0.1';
assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname), 'Tests require LOCAL PostgreSQL');
url.search = '';
// Keep the local database, but put every test table/type in a private schema.
const database = `belok_options_test_${Date.now()}`;
assert.match(database, /^belok_options_test_\d+$/);
const admin = new pg.Client({ connectionString: url.toString() });
await admin.connect();
let created = false;
let client;
let server;
let browser;
let serverLog;
const base = 'http://127.0.0.1:3310';
const secret = 'local-product-options-test-secret';
const signature = createHmac('sha256', secret).update('options-session').digest('hex');
const cookie = `belok_session=options-session.${signature}`;
const kioskCookie = `belok_kiosk=${createHmac('sha256', secret).update('kiosk:test-pin').digest('hex')}`;
const output = 'output/product-options-qa';
mkdirSync(output, { recursive: true });

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), delay(5000)]);
}
async function api(path, body, method = 'POST', kiosk = false) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: kiosk ? kioskCookie : cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  return { status: response.status, data };
}

try {
  await admin.query(`CREATE SCHEMA "${database}"`);
  created = true;
  url.searchParams.set('options', `-c search_path=${database}`);
  client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  for (const name of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
    // Legacy bootstrap migrations hardcode public in information_schema guards.
    // Point those guards at the isolated schema, never the user's public tables.
    await client.query(readFileSync(`migrations/${name}`, 'utf8').replaceAll("table_schema = 'public'", 'table_schema = current_schema()'));
  }
  // Re-running the additive migration must also be safe.
  await client.query(readFileSync('migrations/019_product_options.sql', 'utf8'));
  await client.query(`INSERT INTO users (id, email, role, name, "emailVerifiedAt") VALUES ('options-admin', 'options@example.invalid', 'ADMIN', 'Тест', NOW());
    INSERT INTO sessions (id, "userId") VALUES ('options-session', 'options-admin');
    INSERT INTO categories (id, name) VALUES ('options-category', 'Тестовое меню');
    INSERT INTO app_settings (key, value) VALUES ('kiosk', '{"pinHash":"test-pin"}'), ('notification_settings', '{"adminNewOrdersPush":false}');
    INSERT INTO ingredients (id, name, price) VALUES
      ('milk','Обычное молоко',0), ('oat','Овсяное молоко',40), ('soy','Соевое молоко',50), ('protein','Протеин',60), ('syrup','Ванильный сироп',30);`);
  const env = { ...process.env, DATABASE_URL: url.toString(), DATABASE_SSL: 'false', SESSION_SECRET: secret, JWT_SECRET: secret, BELOK_TEST_MODE: '1', MAPBOX_API_KEY: '', SMTP_HOST: '', RESEND_API_KEY: '', TBANK_TERMINAL_KEY: '', TBANK_PASSWORD: '' };
  serverLog = createWriteStream(`${output}/server.log`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3310'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(serverLog); server.stderr.pipe(serverLog);
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null) throw new Error('Local test server exited; see output/product-options-qa/server.log');
    try { const response = await fetch(`${base}/api/products`); if (response.ok) break; } catch { /* starting */ }
    if (attempt > 90) throw new Error('Local test server did not start');
    await delay(1000);
  }
  const coffeeBody = {
    name: 'Капучино', price: 200, categoryId: 'options-category', calories: 100, proteins: 10, spicinessLevel: 0,
    variants: [{ name: '200 мл', price: null, volumeMl: 200 }, { name: '400 мл', price: 300, volumeMl: 400, calories: 0 }],
    ingredients: [
      { ingredientId: 'milk', isDefault: true, isRemovable: true, isExtra: false, optionGroup: 'Молоко' },
      ...['oat','soy'].map((ingredientId) => ({ ingredientId, isDefault: false, isRemovable: false, isExtra: true, optionGroup: 'Молоко' })),
      { ingredientId: 'protein', isDefault: false, isExtra: true },
      { ingredientId: 'syrup', isDefault: false, isExtra: true, optionGroup: 'Сироп' },
    ],
  };
  const coffeeRes = await api('/api/admin/products', coffeeBody);
  assert.equal(coffeeRes.status, 201, JSON.stringify(coffeeRes.data));
  const coffee = coffeeRes.data.product;
  const large = coffee.variants[1].id;
  assert.equal(coffee.variants[1].calories, 0);
  assert.equal(coffee.ingredients.filter((link) => link.isExtra).length, 4);
  const burritoRes = await api('/api/admin/products', { name: 'Буррито', price: 250, categoryId: 'options-category', calories: 500, spicinessLevel: 3,
    variants: [{ name: 'Вегетарианский', price: 280, calories: 400 }, { name: 'С курицей', price: 320, calories: 550 }, { name: 'С говядиной', price: 360, calories: 650 }] });
  assert.equal(burritoRes.status, 201);
  const burrito = burritoRes.data.product;
  for (const level of [0, 1, 2, 3]) {
    const updated = await api(`/api/admin/products/${burrito.id}`, { spicinessLevel: level }, 'PUT');
    assert.equal(updated.status, 200);
    assert.equal((await api(`/api/products/${burrito.id}`, undefined, 'GET')).data.product.spicinessLevel, level);
  }
  const plainRes = await api('/api/admin/products', { name: 'Без вариантов', price: 100, categoryId: 'options-category' });
  assert.equal(plainRes.status, 201);
  assert.equal((await api(`/api/admin/products/${coffee.id}`, { variants: [{ name: 'Invalid', price: -1 }] }, 'PUT')).status, 400);
  assert.equal((await api(`/api/admin/products/${coffee.id}`, { variants: [{ name: 'Invalid', price: 1.234 }] }, 'PUT')).status, 400);
  assert.equal((await api(`/api/admin/products/${coffee.id}`, { ingredients: [{ ingredientId: 'foreign', isExtra: true }] }, 'PUT')).status, 400);
  assert.equal((await api(`/api/admin/products/${coffee.id}`, { ingredients: [{ ingredientId: 'oat', isDefault: true, isExtra: true, optionGroup: 'Молоко' }] }, 'PUT')).status, 400);
  const item = { productId: coffee.id, variantId: large, quantity: 2, customizations: [{ ingredientId: 'soy', action: 'ADD', priceDelta: -9000 }, { ingredientId: 'protein', action: 'ADD', priceDelta: 0 }] };
  const orderIds = [];
  for (const kiosk of [false, true]) {
    const endpoint = kiosk ? '/api/kiosk/orders' : '/api/orders';
    const request = (items) => ({ items, fulfillment: 'PICKUP', paymentMethod: 'CASH' });
    const result = await api(endpoint, request([item]), 'POST', kiosk);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.order.total, 820);
    assert.equal(result.data.order.items[0].unitPrice, 410);
    assert.equal(result.data.order.items[0].variantName, '400 мл');
    assert.deepEqual(result.data.order.items[0].customizations.map((choice) => choice.ingredientName).sort(), ['Обычное молоко', 'Протеин', 'Соевое молоко'].sort());
    orderIds.push(result.data.order.id);
    const invalids = [
      { ...item, variantId: burrito.variants[0].id }, { ...item, variantId: null }, { ...item, quantity: 0 },
      { ...item, customizations: [{ ingredientId: 'foreign', action: 'ADD' }] },
      { ...item, customizations: ['oat','soy'].map((ingredientId) => ({ ingredientId, action: 'ADD' })) },
      { ...item, customizations: ['protein','protein'].map((ingredientId) => ({ ingredientId, action: 'ADD' })) },
    ];
    for (const invalid of invalids) assert.equal((await api(endpoint, request([invalid]), 'POST', kiosk)).status, 400);
    assert.equal((await api(endpoint, request([{ productId: plainRes.data.product.id, quantity: 1 }]), 'POST', kiosk)).data.order.total, 100);
  }
  await client.query(`UPDATE ingredients SET name = 'Изменённое имя', price = 999 WHERE id = 'soy'`);
  const historical = await api(`/api/admin/orders/${orderIds[0]}`, undefined, 'GET');
  assert.equal(historical.data.order.items[0].unitPrice, 410);
  assert.equal(historical.data.order.items[0].customizations.find((choice) => choice.ingredientId === 'soy').ingredient.name, 'Соевое молоко');
  await client.query(`UPDATE ingredients SET name = 'Соевое молоко', price = 50 WHERE id = 'soy'`);
  console.log('PASS: migrations, admin persistence, both checkout APIs, forged prices, invalid choices, legacy products and historical snapshots');

  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (error) => console.error('Browser error:', error.message));
  page.on('requestfailed', (request) => { if (request.url().startsWith(base)) console.error('Local request failed:', new URL(request.url()).pathname, request.failure()?.errorText); });
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('belok_push_dismissed_session', '1'); localStorage.setItem('belok-pwa-install-dismissed', '1'); } catch { /* opaque dev frames */ } });
  await page.setCookie({ name: 'belok_session', value: cookie.split('=')[1], url: base }, { name: 'belok_kiosk', value: kioskCookie.split('=')[1], url: base });
  // Keep test browsing local: fonts, analytics and other external assets are unnecessary.
  await page.setRequestInterception(true);
  page.on('request', (request) => { if (request.url().startsWith(base) || request.url().startsWith('data:')) request.continue(); else request.abort(); });
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 900, isMobile: width < 768, hasTouch: width < 768 });
    for (const route of ['/menu', '/kiosk']) {
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.food-card');
      assert.equal(await page.$$eval('.food-card', (cards) => cards.length), 3, 'one slot per product');
      const coffeeCard = await page.$('.food-card:has([aria-label^="Открыть Капучино"])');
      assert.ok(coffeeCard);
      await coffeeCard.$eval('[aria-label^="Следующий вариант"]', (button) => button.click());
      await page.waitForFunction(() => document.querySelector('.food-card:has([aria-label^="Открыть Капучино"])').textContent.includes('400 мл'));
      const text = await coffeeCard.evaluate((card) => card.textContent);
      assert.ok(text.includes('300') && text.includes('0 ккал'), text);
      assert.equal(await page.$$eval('.food-card:has([aria-label^="Открыть Буррито"]) [role="img"] svg', (icons) => icons.length), 3);
      await page.screenshot({ path: `${output}/${route.slice(1)}-${width}.png`, fullPage: true });
      if (width === 390) {
        const media = await coffeeCard.$('.food-card__media');
        const rect = await media.boundingBox();
        await page.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height * 0.7);
        await page.mouse.down();
        await page.mouse.move(rect.x + rect.width * 0.2, rect.y + rect.height * 0.7, { steps: 8 });
        await page.mouse.up();
        await page.waitForFunction(() => document.querySelector('.food-card:has([aria-label^="Открыть Капучино"])').textContent.includes('200 мл'));
        assert.equal(new URL(page.url()).pathname, route, 'swiping must not open the product');
      }
      if (route === '/kiosk' && width === 1440) {
        await coffeeCard.$eval('[aria-label^="Открыть Капучино"]', (button) => button.click());
        await page.waitForSelector('[role="dialog"] select[aria-label="Молоко"]');
        await page.select('[role="dialog"] select[aria-label="Молоко"]', 'oat');
        await page.$$eval('[role="dialog"] label', (labels) => labels.find((label) => label.textContent.includes('Протеин')).querySelector('input').click());
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some((button) => button.textContent.includes('В заказ · 400')));
        await page.$$eval('[role="dialog"] button', (buttons) => buttons.find((button) => button.textContent.includes('В заказ ·')).click());
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        await page.$$eval('button', (buttons) => buttons.find((button) => button.textContent.includes('К заказу ·')).click());
        await page.waitForFunction(() => document.body.textContent.includes('Овсяное молоко'));
        assert.ok((await page.$eval('body', (body) => body.textContent)).includes('400'));
      }
    }
  }
  await page.setViewport({ width: 390, height: 900, isMobile: true, hasTouch: true });
  await page.goto(`${base}/menu/${coffee.id}?v=${large}`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('select');
  await page.evaluate(() => { localStorage.setItem('belok-pwa-install-dismissed', '1'); });
  await page.select('select[aria-label="Молоко"]', 'soy');
  await page.$$eval('label', (labels) => labels.find((label) => label.textContent.includes('Протеин') && label.querySelector('input[type=checkbox]')).querySelector('input').click());
  await page.screenshot({ path: `${output}/coffee-options-mobile.png`, fullPage: true });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('В корзину · 410')));
  await page.screenshot({ path: `${output}/coffee-options-mobile.png`, fullPage: true });
  await page.$$eval('button', (buttons) => buttons.find((button) => button.textContent.includes('В корзину ·')).click());
  await page.waitForFunction(() => location.pathname === '/cart');
  assert.ok((await page.$eval('body', (body) => body.textContent)).includes('410'));
  assert.ok((await page.$eval('body', (body) => body.textContent)).includes('Соевое молоко'));
  await page.goto(`${base}/admin/products/${coffee.id}/edit`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[aria-label="Цена, ₽ варианта 400 мл"]');
  assert.equal(await page.$eval('input[aria-label="Ккал варианта 400 мл"]', (input) => input.value), '0');
  const priceInput = await page.$('input[aria-label="Цена, ₽ варианта 400 мл"]');
  await priceInput.evaluate((input) => input.scrollIntoView({ block: 'center' }));
  await priceInput.focus();
  await priceInput.press('End');
  const oldPriceLength = await priceInput.evaluate((input) => input.value.length);
  for (let index = 0; index < oldPriceLength; index++) await priceInput.press('Backspace');
  await priceInput.type('350');
  assert.equal(await priceInput.evaluate((input) => input.value), '350');
  await page.screenshot({ path: `${output}/admin-variants-mobile.png`, fullPage: true });
  await page.$$eval('button', (buttons) => buttons.find((button) => button.textContent.trim() === 'Сохранить').click());
  await page.waitForFunction(() => location.pathname === '/admin/products');
  const saved = await api(`/api/admin/products/${coffee.id}`, undefined, 'GET');
  assert.equal(saved.data.product.variants[1].price, 350);
  assert.equal(saved.data.product.variants[1].calories, 0);
  assert.equal(saved.data.product.ingredients.filter((link) => link.isExtra).length, 4, 'admin preserves extra flags');
  assert.equal(saved.data.product.ingredients.find((link) => link.ingredientId === 'soy').optionGroup, 'Молоко');
  console.log('PASS: real menu/kiosk at 390 and 1440px, variant price/nutrition, peppers, options, cart, admin save and groups');
  // Reuse the complete 0–3 pepper UI regression on this isolated server.
  await new Promise((resolve, reject) => {
    const regression = spawn(process.execPath, ['scripts/test-product-spiciness-browser.mjs'], {
      env: { ...env, BASE_URL: base }, windowsHide: true, stdio: 'inherit',
    });
    regression.once('error', reject);
    regression.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Pepper UI regression exited with ${code}`)));
  });
} catch (error) {
  if (browser) {
    const pages = await browser.pages();
    const page = pages.at(-1);
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    console.error('Browser state:', await page.evaluate(() => document.body.innerText).catch(() => 'unavailable'));
  }
  throw error;
} finally {
  await browser?.close();
  await stopServer();
  serverLog?.end();
  await client?.end();
  if (created) await admin.query(`DROP SCHEMA "${database}" CASCADE`);
  await admin.end();
}
