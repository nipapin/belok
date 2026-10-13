/** Dashboard interaction checks with isolated API fixtures; no database writes. */
import assert from 'node:assert/strict';
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const base = process.env.BASE_URL || 'http://localhost:3107';
const output = 'output/admin-ux';
await mkdir(output, { recursive: true });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kaliningrad' }).format(new Date());
const fixtures = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 6 + index);
  return ['CASH', 'CARD', 'SBP'].map((paymentMethod, method) => ({
    id: `day-${index}-${method}`, status: 'COMPLETED', paymentStatus: 'SUCCEEDED',
    paymentMethod, total: (index + 1) * (method + 1) * 100,
    createdAt: date.toISOString(), user: null, comment: null, items: [],
  }));
}).flat();
let orders = fixtures;
let responseStatus = 200;
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  await page.setBypassServiceWorker(true);
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  assert.ok(secret, 'Test session signing secret required');
  const signature = createHmac('sha256', secret).update('week-chart-test').digest('hex');
  await page.setCookie({ name: 'belok_session', value: `week-chart-test.${signature}`, url: base });
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return request.abort();
    if (!url.pathname.startsWith('/api/')) return request.continue();
    let data = {};
    let status = 200;
    if (url.pathname === '/api/auth/me') data = { user: { id: 'test-admin', role: 'ADMIN', name: 'Администратор', email: 'test@example.invalid' } };
    if (url.pathname === '/api/admin/orders') { data = { orders }; status = responseStatus; }
    if (url.pathname === '/api/admin/products') data = { products: [] };
    if (url.pathname === '/api/admin/users') data = { users: [] };
    return request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const panel = '.dashboard-week';
  const revenueButton = `${panel} .dashboard-week-controls button:nth-child(2)`;
  for (const width of [320, 390, 1440]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${base}/admin`, { waitUntil: 'networkidle2' });
    await page.waitForSelector(`${panel} .dashboard-chart-column`);
    assert.equal(await page.$$eval(`${panel} .dashboard-chart-column`, (bars) => bars.length), 7);
    assert.match(await page.$eval(`${panel} .dashboard-week-total`, (el) => el.textContent), /21/);
    await page.click(revenueButton);
    assert.equal(await page.$eval(revenueButton, (el) => el.getAttribute('aria-pressed')), 'true');
    assert.match(await page.$eval(`${panel} .dashboard-week-total`, (el) => el.textContent), /16\s*800/);
    assert.match(await page.$eval(`${panel} .dashboard-payment-legend`, (el) => el.textContent), /2\s*800/);
    assert.match(await page.$eval(`${panel} .dashboard-payment-legend`, (el) => el.textContent), /14\s*000/);
    const segments = await page.$$eval(`${panel} .dashboard-chart-column:last-child .dashboard-bar-segment`, (els) => els.map((el) => parseFloat(el.style.height)));
    assert.ok(Math.abs(segments[0] - 100 / 6) < 0.01);
    assert.ok(Math.abs(segments[1] - 500 / 6) < 0.01);
    await page.click(`${panel} .dashboard-chart-column:first-child`);
    assert.match(await page.$eval(`${panel} .dashboard-day-detail`, (el) => el.textContent), /Наличные\s*100\s*₽.*Безнал\s*500\s*₽/);
    // Keyboard selection works for the next day as well.
    await page.focus(`${panel} .dashboard-chart-column:nth-child(2)`);
    await page.keyboard.press('Enter');
    assert.match(await page.$eval(`${panel} .dashboard-day-detail`, (el) => el.textContent), /Наличные\s*200\s*₽/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `No horizontal overflow at ${width}px`);
    const chart = await page.$(panel);
    await chart.screenshot({ path: `${output}/week-revenue-${width}.png` });
    await page.click(`${panel} .dashboard-week-controls button:first-child`);
    assert.equal(await page.$(`${panel} .dashboard-payment-legend`), null);
    console.log(`PASS: orders/revenue, stacked amounts, day selection, keyboard, layout at ${width}px`);
  }
  orders = [{ ...fixtures[0], paymentMethod: null }];
  await page.reload({ waitUntil: 'networkidle2' });
  await page.click(revenueButton);
  await page.waitForSelector(`${panel} .is-unknown`);
  assert.match(await page.$eval(`${panel} .dashboard-payment-legend`, (el) => el.textContent), /Не указан\s*100/);
  orders = [];
  await page.reload({ waitUntil: 'networkidle2' });
  await page.click(revenueButton);
  assert.match(await page.$eval(`${panel} .dashboard-chart-note`, (el) => el.textContent), /оплаченных заказов нет/);
  assert.ok((await page.$$eval(`${panel} .dashboard-bar`, (els) => els.map((el) => el.style.height))).every((height) => height === '0%'));
  responseStatus = 503;
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector(`${panel} .dashboard-inline-error`);
  assert.equal(await page.$(`${panel} .dashboard-bar-chart`), null);
  console.log('PASS: unknown payment method, empty week and unavailable data');
} finally {
  await browser.close();
}
