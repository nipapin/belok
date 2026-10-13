import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import puppeteer from 'puppeteer';

const base = process.env.REVENUE_TEST_URL ?? 'http://127.0.0.1:3101';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local server with mocked data only');
const secret = process.env.SESSION_SECRET ?? 'local-check-only';
const session = `qa.${createHmac('sha256', secret).update('qa').digest('hex')}`;
const item = (id, name, quantity) => ({ productId: id, product: { name }, quantity, unitPrice: 250, customizations: [] });
const order = (id, items, overrides = {}) => ({ id, items, createdAt: '2026-10-12T06:00:00Z', status: 'COMPLETED', paymentStatus: 'SUCCEEDED', total: 500, user: null, comment: null, ...overrides });
const orders = [
  order('soup', [item('soup', 'Чечевичный крем-суп', 2), item('soup', 'Чечевичный крем-суп', 3), item('salad', 'Салат с очень длинным названием для проверки переноса на мобильном экране', 4)]),
  order('second', [item('soup', 'Чечевичный крем-суп', 1)], { createdAt: '2026-10-13T06:00:00Z' }),
  order('writeoff', [item('soup', 'Чечевичный крем-суп', 5)], { isWriteOff: true }),
  order('cancelled', [item('soup', 'Чечевичный крем-суп', 99)], { status: 'CANCELLED' }),
  order('pending', [item('soup', 'Чечевичный крем-суп', 99)], { paymentStatus: 'PENDING' }),
];
const browser = await puppeteer.launch({ headless: 'shell', pipe: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setBypassServiceWorker(true);
  await page.setCookie({ name: 'belok_session', value: session, url: base });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return void request.continue();
    const payload = path === '/api/auth/me' ? { user: { id: 'qa', role: 'MANAGER', name: 'Тест' } } : path === '/api/admin/orders' ? { orders } : {};
    void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  async function click(selector) { await page.$eval(selector, node => node.scrollIntoView({ block: 'center' })); await page.click(selector); }
  for (const width of [1440, 390, 320]) {
    await page.setViewport({ width, height: 1000, isMobile: width < 500, deviceScaleFactor: 1 });
    await page.goto(`${base}/admin/dish-sales?from=2026-10-12&to=2026-10-13`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.dish-sales-table tbody tr');
    const rows = await page.$$eval('.dish-sales-table tbody tr', nodes => nodes.map(node => [...node.children].map(cell => cell.textContent)));
    assert.deepEqual(rows.map(row => row.slice(1)), [['6', '2', '5'], ['4', '1', '0']]);
    assert.deepEqual(await page.$$eval('.dish-sales-table tfoot td', nodes => nodes.map(node => node.textContent)), ['10', '2', '5']);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page fits ${width}px`);
    await page.type('.dish-sales-search input', 'крем');
    assert.equal(await page.$$eval('.dish-sales-table tbody tr', nodes => nodes.length), 1);
    assert.equal(await page.$eval('.dish-sales-table tfoot td', node => node.textContent), '10');
    await page.type('.dish-sales-search input', 'неизвестный');
    assert.equal(await page.$$eval('.dish-sales-table tbody tr', nodes => nodes.length), 0);
    await click('.sales-date-trigger');
    await page.waitForSelector('.sales-date-dialog[open]');
    for (const index of [0, 1, 2]) {
      await page.$$eval('.sales-date-presets button', (buttons, index) => buttons[index].click(), index);
      await click('.sales-date-footer button');
      await page.waitForFunction(index => document.querySelector('.dish-sales-table tfoot td')?.textContent === (index === 0 ? '1' : '10'), {}, index);
      await page.waitForFunction(() => !document.querySelector('.sales-date-dialog[open]'));
      const params = new URL(page.url()).searchParams;
      assert.ok(params.get('from') && params.get('to'));
      await click('.sales-date-trigger');
    }
    await page.$eval('.sales-date-modes button:last-child', button => button.click());
    await click('[data-day="2026-10-12"]');
    await click('[data-day="2026-10-12"]');
    await click('.sales-date-footer button');
    await page.waitForFunction(() => location.search === '?from=2026-10-12&to=2026-10-12');
    await page.waitForFunction(() => document.querySelector('.dish-sales-table tfoot td')?.textContent === '9');
    assert.match(await page.$eval('a.revenue-daily-link', node => node.getAttribute('href')), /revenue\?from=2026-10-12&to=2026-10-12/);
    if (process.env.DISH_SALES_SCREENSHOT_DIR) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(process.env.DISH_SALES_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.DISH_SALES_SCREENSHOT_DIR}/dish-sales-${width}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log('Dish quantities, writeoffs, search, presets/custom dates, manager access and desktop/mobile layout passed');
} finally { await browser.close(); }
