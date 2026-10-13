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
const orders = [fixture('cash'), fixture('card', { paymentMethod: 'CARD', total: 200 }), fixture('employee', { isWriteOff: true, total: 900 }), fixture('next-day', { createdAt: '2026-10-14T08:00:00Z', total: 100 })];
const browser = await puppeteer.launch({ headless: 'shell', pipe: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setCookie({ name: 'belok_session', value: session, url: base });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith('/api/')) return void request.continue();
    const payload = pathname === '/api/auth/me' ? { user: { id: 'qa', role: 'ADMIN', name: 'Тест', bonusBalance: 0, totalSpent: 0 } }
      : pathname === '/api/admin/orders' ? { orders }
      : pathname === '/api/admin/users' ? { users: [] }
      : pathname === '/api/admin/products' ? { products: [] }
      : {};
    void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewport({ width, height: 1000, isMobile: width < 500, deviceScaleFactor: 1 });
    await page.goto(`${base}/admin/revenue?from=2026-10-13&to=2026-10-14`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.revenue-table tbody tr');
    const summary = await page.$eval('.revenue-summary', node => node.innerText);
    assert.match(summary, /800\s*₽/);
    assert.match(summary, /900\s*₽/);
    assert.equal(await page.$$eval('.revenue-hour', nodes => nodes.length), 13);
    assert.equal(await page.$$eval('.revenue-table tbody tr', nodes => nodes.length), 2);
    assert.equal(await page.$$eval('.revenue-writeoff', nodes => nodes.length), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `No page overflow at ${width}px`);
    if (process.env.REVENUE_SCREENSHOT_DIR) {
      await mkdir(process.env.REVENUE_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.REVENUE_SCREENSHOT_DIR, `revenue-${width}.png`), fullPage: true });
    }
    await page.click(width < 500 ? '.revenue-day-card' : '.revenue-table tbody tr a');
    await page.waitForFunction(() => location.search === '?from=2026-10-13&to=2026-10-13');
    await page.waitForFunction(() => document.querySelectorAll('.revenue-table tbody tr').length === 1);
    assert.match(await page.$eval('.revenue-summary', node => node.innerText), /700\s*₽/);
  }
  await page.goto(`${base}/admin`, { waitUntil: 'networkidle0' });
  assert.equal(await page.$$eval('a.dashboard-chart-column', nodes => nodes.length), 7);
  await page.click('a.dashboard-chart-column:last-child');
  await page.waitForSelector('.revenue-table');
  assert.match(page.url(), /\/admin\/revenue\?from=/);
  assert.deepEqual(errors, []);
  console.log('Desktop/mobile layout, daily totals, write-offs and weekly chart navigation passed');
} finally { await browser.close(); }
