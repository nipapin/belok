import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const base = process.env.REVENUE_TEST_URL ?? 'http://127.0.0.1:3101';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local server with mocked data only');
const secret = process.env.SESSION_SECRET ?? 'local-check-only';
const session = `qa.${createHmac('sha256', secret).update('qa').digest('hex')}`;
const fixture = (id, overrides = {}) => ({ id, status: 'COMPLETED', total: 500, paymentStatus: 'SUCCEEDED', paymentMethod: 'CASH', createdAt: '2026-10-13T06:00:00Z', user: { name: 'Тестовый клиент', email: 'client@example.test', phone: null }, comment: null, guestEmail: null, items: [], ...overrides });
let manyOrders = false;
const orders = [fixture('first', { createdAt: '2026-05-24T10:00:00Z', total: 0 }), fixture('cash', { createdAt: '2026-10-12T06:00:00Z' }), fixture('card', { createdAt: '2026-10-12T06:00:00Z', paymentMethod: 'CARD', total: 200 }), fixture('employee', { createdAt: '2026-10-12T06:00:00Z', isWriteOff: true, total: 900 }), fixture('next-day', { createdAt: '2026-10-13T08:00:00Z', total: 100 })];
const item = { product: { name: 'Шаурма вегетарианская с очень длинным названием' }, quantity: 1, unitPrice: 350, customizations: [] };
const largeOrders = Array.from({ length: 78 }, (_, i) => fixture(`grid-${i}`, { dailyNumber: 682 - i, total: 350 + i, createdAt: '2026-10-12T06:00:00Z', comment: i === 0 ? 'Комментарий к заказу, который переносится внутри карточки' : null, items: [item, { ...item, product: { name: 'Чечевичный крем-суп' }, unitPrice: 250 }], status: i % 3 ? 'COMPLETED' : 'READY' }));
const browser = await puppeteer.launch({ headless: 'shell', pipe: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  async function click(selector) {
    await page.$eval(selector, node => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.click(selector);
  }
  await page.setBypassServiceWorker(true);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setCookie({ name: 'belok_session', value: session, url: base });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith('/api/')) return void request.continue();
    const payload = pathname === '/api/auth/me' ? { user: { id: 'qa', role: 'ADMIN', name: 'Тест', bonusBalance: 0, totalSpent: 0 } }
      : pathname === '/api/admin/orders' ? { orders: manyOrders ? [...orders, ...largeOrders] : orders }
      : pathname === '/api/admin/users' ? { users: [] }
      : pathname === '/api/admin/products' ? { products: [] }
      : pathname === '/api/admin/weather' ? { configured: true, firstDay: '2026-05-24', days: Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${String(7 + i).padStart(2, '0')}`, temperature: 15, precipitation: 0, condition: ['sun', 'cloud', 'rain'][i % 3], complete: true, hours: 13, source: 'archive' })) }
      : {};
    void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  for (const width of (process.env.REVENUE_TEST_WIDTHS?.split(',').map(Number) ?? [1440, 390, 320])) {
    await page.setViewport({ width, height: 1000, isMobile: width < 500, deviceScaleFactor: 1 });
    await page.goto(`${base}/admin/revenue?from=2026-10-12&to=2026-10-13`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.revenue-daily-column').catch(async error => { console.error('Chart failed:', width, page.url(), await page.$eval('body', node => node.innerText.slice(0, 2500)), errors); throw error; });
    const summary = await page.$eval('.revenue-summary', node => node.innerText);
    assert.match(summary, /800\s*₽/);
    assert.match(summary, /900\s*₽/);
    assert.equal(await page.$$eval('.revenue-hour', nodes => nodes.length), 13);
    assert.equal(await page.$$eval('.revenue-daily-column', nodes => nodes.length), 2);
    assert.equal(await page.$eval('.revenue-daily-column[aria-pressed=true]', node => node.getAttribute('aria-label').includes('700')), true);
    await click('.revenue-daily .dashboard-segmented button:last-child');
    await page.waitForFunction(() => document.querySelector('.revenue-daily .dashboard-segmented button:last-child')?.getAttribute('aria-pressed') === 'true');
    assert.match(await page.$eval('.revenue-daily-column', node => node.getAttribute('aria-label')), /3 заказов/);
    assert.match(await page.$eval('.revenue-daily-column', node => node.getAttribute('aria-label')), /Наличные: 2/);
    assert.match(await page.$eval('.revenue-daily-column', node => node.getAttribute('aria-label')), /Безналичные · карта и СБП: 1/);
    await click('.revenue-daily-column:last-child');
    await page.waitForFunction(() => document.querySelector('.revenue-daily-column:last-child')?.getAttribute('aria-pressed') === 'true');
    assert.match(await page.$eval('.revenue-daily-detail', node => node.innerText), /13 октября/);
    await click('.revenue-daily-column:first-child');
    await click('.revenue-daily .dashboard-segmented button:first-child');
    await page.waitForFunction(() => document.querySelector('.revenue-daily .dashboard-segmented button:first-child')?.getAttribute('aria-pressed') === 'true');
    const shortHeight = await page.$eval('.revenue-daily', node => node.getBoundingClientRect().height);
    await page.goto(`${base}/admin/revenue?from=2026-05-24&to=2026-10-13`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.revenue-daily-column');
    assert.ok(await page.$$eval('.revenue-daily-column', nodes => nodes.length) > 100);
    assert.ok(await page.$eval('.revenue-daily', node => node.getBoundingClientRect().height) <= shortHeight + 60, 'Long period keeps fixed chart height');
    assert.equal(await page.$eval('.revenue-daily-scroll', node => node.scrollWidth > node.clientWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Long period fits ${width}px`);
    if (process.env.REVENUE_SCREENSHOT_DIR) {
      await mkdir(process.env.REVENUE_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.REVENUE_SCREENSHOT_DIR, `revenue-long-${width}.png`), fullPage: true });
    }
    await page.goto(`${base}/admin/revenue?from=2026-10-12&to=2026-10-13`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.revenue-daily-column');
    assert.equal(await page.$$eval('.revenue-writeoff', nodes => nodes.length), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `No page overflow at ${width}px`);
    if (process.env.REVENUE_SCREENSHOT_DIR) {
      await mkdir(process.env.REVENUE_SCREENSHOT_DIR, { recursive: true });
      await (await page.$('.revenue-daily')).screenshot({ path: join(process.env.REVENUE_SCREENSHOT_DIR, `revenue-${width}.png`) });
    }
    await click('.revenue-daily-link');
    await page.waitForFunction(() => { const params = new URLSearchParams(location.search); return params.get('from') === '2026-10-12' && params.get('to') === '2026-10-12'; }).catch(async error => { console.error('Navigation failed:', page.url(), errors); throw error; });
    await page.waitForFunction(() => !document.querySelector('.revenue-daily'));
    assert.equal(await page.$$eval('.revenue-hour', nodes => nodes.length), 13);
    assert.equal(await page.$$eval('.sales-weather-card', nodes => nodes.length), 1);
    assert.match(await page.$eval('.revenue-summary', node => node.innerText), /700\s*₽/);
    await click('.sales-date-trigger');
    await page.waitForSelector('.sales-date-dialog[open]');
    assert.equal(await page.$$eval('input[type=date]', nodes => nodes.length), 0);
    assert.equal(await page.evaluate(() => document.querySelector('.sales-date-dialog').scrollWidth <= document.querySelector('.sales-date-dialog').clientWidth), true, `Calendar fits ${width}px`);
    await page.$eval('.sales-date-modes button:last-child', button => button.click());
    await click('[data-day="2026-10-10"]');
    await click('[data-day="2026-10-12"]');
    if (process.env.REVENUE_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.REVENUE_SCREENSHOT_DIR, `calendar-${width}.png`) });
    await click('.sales-date-footer button');
    await page.waitForFunction(() => location.search === '?from=2026-10-10&to=2026-10-12');
    await page.waitForFunction(() => document.querySelectorAll('.revenue-daily-column').length === 3);
    await click('.sales-date-trigger');
    await page.$eval('.sales-date-presets button:last-child', button => button.click());
    assert.equal(await page.$eval('[data-day="2026-05-23"]', button => button.disabled), true);
    assert.equal(await page.$eval('[data-day="2026-05-24"]', button => button.disabled), false);
    assert.equal(await page.$eval('[aria-label="Предыдущий месяц"]', button => button.disabled), true);
    await page.keyboard.press('Escape');
    manyOrders = true;
    await page.goto(`${base}/admin/revenue?from=2026-10-12&to=2026-10-13`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.revenue-order-list > a').length === 82);
    const grid = await page.$eval('.revenue-order-list', node => ({
      columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
      height: node.clientHeight, scrollHeight: node.scrollHeight,
    }));
    assert.equal(grid.columns > 1, width > 700, `Grid/list layout at ${width}px`);
    assert.ok(grid.scrollHeight > grid.height, 'Orders scroll internally');
    assert.ok(grid.height <= 644, 'Order block height is limited');
    await page.$eval('.revenue-order-list', node => { node.scrollTop = 250; });
    assert.ok(await page.$eval('.revenue-order-list', node => node.scrollTop) > 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Order cards fit ${width}px`);
    await page.$eval('.revenue-order-list', node => { node.scrollTop = 0; });
    if (process.env.REVENUE_SCREENSHOT_DIR) await (await page.$('.revenue-order-list')).screenshot({ path: join(process.env.REVENUE_SCREENSHOT_DIR, `revenue-orders-${width}.png`) });
    assert.match(await page.$eval('.revenue-order-list a', node => node.getAttribute('href')), /\/admin\/orders\//);
    manyOrders = false;
  }
  await page.goto(`${base}/admin`, { waitUntil: 'networkidle0' });
  assert.equal(await page.$$eval('a.dashboard-chart-column', nodes => nodes.length), 7);
  assert.equal(await page.$$eval('.dashboard-day-weather .weather-icon', nodes => nodes.length), 7);
  assert.match(await page.$eval('.dashboard-day-weather', node => node.innerText), /\+15 °C/);
  assert.equal(await page.$$eval('.sales-weather-card', nodes => nodes.length), 0);
  if (process.env.REVENUE_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.REVENUE_SCREENSHOT_DIR, 'week-weather.png'), fullPage: true });
  await click('a.dashboard-chart-column:last-child');
  await page.waitForSelector('.revenue-hours');
  assert.equal(await page.$$eval('.revenue-daily', nodes => nodes.length), 0);
  assert.match(page.url(), /\/admin\/revenue\?from=/);
  assert.deepEqual(errors, []);
  console.log('Desktop/mobile daily charts, payment splits, bounded long periods, single-day hiding, scrollable order cards and navigation passed');
} finally { await browser.close(); }
