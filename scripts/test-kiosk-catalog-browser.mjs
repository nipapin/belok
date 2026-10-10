import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const base = process.env.BASE_URL || 'http://localhost:3000';
const browser = await puppeteer.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1000 });
  await page.setBypassServiceWorker(true);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let unlocked = false;
  let failing = false;
  let deleted = false;
  let catalogRequests = 0;
  let categories = [{ id: 'cat', name: 'Блюда', isActive: true, sortOrder: 0 }];
  const product = (id, name, price) => ({ id, name, price, categoryId: 'cat', category: categories[0], isAvailable: true, image: null, ingredients: [], variants: [], spicinessLevel: 0, createdAt: new Date().toISOString() });
  let products = [product('bowl', 'Тестовый боул', 100), product('salad', 'Тестовый салат', 150)];
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    const respond = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/kiosk/session') return void respond({ configured: true, unlocked });
    if (path.startsWith('/api/products')) {
      catalogRequests++;
      if (failing) return void respond({ error: 'offline' }, 503);
      if (path === '/api/products/categories') return void respond({ categories });
      if (path === '/api/products') return void respond({ products: products.filter((item) => item.isAvailable) });
      if (path === '/api/products/bowl') return void respond(deleted ? { error: 'not found' } : { product: products.find((item) => item.id === 'bowl') }, deleted ? 404 : 200);
    }
    if (path.startsWith('/api/')) return void respond({});
    void request.continue();
  });
  await page.goto(`${base}/kiosk`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.includes('PIN'));
  assert.equal(catalogRequests, 0, 'Locked kiosk must not poll the catalog');
  unlocked = true;
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('[aria-label="Добавить Тестовый боул в корзину"]');
  await page.click('[aria-label="Добавить Тестовый боул в корзину"]');
  categories = [{ ...categories[0], name: 'Обновлённые блюда' }];
  products = [{ ...products[0], name: 'Обновлённый боул', price: 250, category: categories[0] }, { ...products[1], isAvailable: false }, product('soup', 'Новый суп', 180)];
  await page.waitForFunction(() => document.body.innerText.includes('Обновлённый боул') && document.body.innerText.includes('Новый суп') && document.body.innerText.includes('Обновлённые блюда') && !document.body.innerText.includes('Тестовый салат'), { timeout: 12000 });
  assert.ok(await page.$('[aria-label="Убрать Обновлённый боул из корзины"]'), 'Polling must preserve the existing basket');
  failing = true;
  const beforeFailure = catalogRequests;
  await new Promise((resolve) => setTimeout(resolve, 6000));
  assert.ok(catalogRequests > beforeFailure);
  assert.ok((await page.$eval('body', (body) => body.innerText)).includes('Новый суп'), 'Failed refresh must retain the last successful menu');
  failing = false;
  const card = await page.waitForSelector('[aria-label^="Открыть Обновлённый боул"]');
  await card.click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForFunction(() => document.querySelector('[role="dialog"]').innerText.includes('250 ₽'));
  products[0] = { ...products[0], price: 310, description: 'Свежий состав', isAvailable: false };
  await page.waitForFunction(() => document.querySelector('[role="dialog"]').innerText.includes('310 ₽') && document.querySelector('[role="dialog"]').innerText.includes('Блюдо сейчас недоступно'), { timeout: 12000 });
  assert.equal(await page.$eval('[role="dialog"] .btn-primary', (button) => button.disabled), true);
  deleted = true;
  await page.waitForFunction(() => document.querySelector('[role="dialog"]').innerText.includes('Товар не найден'), { timeout: 12000 });
  assert.equal(await page.$('[role="dialog"] .btn-primary'), null);
  assert.deepEqual(errors, []);
  console.log('PASS: kiosk catalog polls without reload; names/categories/prices/new products/stop list update; basket survives; errors retain menu; open modal handles price changes, unavailability and deletion');
} finally { await browser.close(); }
