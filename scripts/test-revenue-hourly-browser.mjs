import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const base = process.env.REVENUE_TEST_URL ?? 'http://localhost:3111';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local server with mocked data only');
const secret = process.env.SESSION_SECRET ?? 'local-check-only';
const session = `qa.${createHmac('sha256', secret).update('qa').digest('hex')}`;
const order = (id, overrides = {}) => ({ id, status: 'COMPLETED', total: 100, paymentStatus: 'SUCCEEDED', paymentMethod: 'CASH', createdAt: '2026-10-13T06:00:00Z', user: null, comment: null, items: [], ...overrides });
let orders = [
  order('cash'), order('card', { total: 30, paymentMethod: 'CARD' }),
  order('sbp', { total: 20, paymentMethod: 'SBP' }), order('writeoff', { total: 900, isWriteOff: true }),
  order('large-card', { total: 1000, paymentMethod: 'CARD', createdAt: '2026-10-13T07:00:00Z' }),
  order('cancelled', { total: 9999, status: 'CANCELLED' }),
  order('pending', { total: 9999, paymentStatus: 'PENDING', createdAt: '2026-10-13T08:00:00Z' }),
  order('outside', { total: 200, createdAt: '2026-10-13T19:00:00Z' }),
];
const browser = await puppeteer.launch({ headless: 'shell', pipe: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  await page.setBypassServiceWorker(true);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setCookie({ name: 'belok_session', value: session, url: base });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return void request.abort();
    if (!url.pathname.startsWith('/api/')) return void request.continue();
    const payload = url.pathname === '/api/auth/me' ? { user: { id: 'qa', role: 'ADMIN', name: 'Тест', bonusBalance: 0, totalSpent: 0 } }
      : url.pathname === '/api/admin/orders' ? { orders }
      : url.pathname === '/api/admin/weather' ? { configured: true, days: [], firstDay: '2026-10-13' } : {};
    void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  const panel = '.revenue-hourly';
  const revenueButton = `${panel} .dashboard-segmented button:last-child`;
  const ordersButton = `${panel} .dashboard-segmented button:first-child`;
  async function click(selector) {
    await page.$eval(selector, node => node.scrollIntoView({ block: 'center' }));
    await page.click(selector);
  }
  const widths = process.env.REVENUE_TEST_WIDTHS?.split(',').map(Number) ?? [1440, 1024, 768, 390, 320];
  for (const width of widths) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${base}/admin/revenue?from=2026-10-13&to=2026-10-13`, { waitUntil: 'networkidle0' });
    await page.waitForSelector(`${panel} .revenue-hour`).catch(async error => {
      console.error('Hourly chart failed:', page.url(), await page.$eval('body', node => node.innerText.slice(0, 2500)), errors);
      throw error;
    });
    assert.equal(await page.$$eval(`${panel} .revenue-hour`, nodes => nodes.length), 13);
    assert.equal(await page.$eval(ordersButton, node => node.getAttribute('aria-pressed')), 'true');
    assert.match(await page.$eval(`${panel} .revenue-hour:first-child`, node => node.innerText), /4\s*\(67%\)/);
    const countWidths = await page.$$eval(`${panel} .revenue-hour-track > div`, nodes => nodes.map(node => parseFloat(node.style.width)));
    assert.equal(countWidths[0], 100);
    assert.equal(countWidths[1], 25);
    await click(revenueButton);
    await page.waitForSelector(`${panel} .is-revenue`);
    assert.equal(await page.$eval(revenueButton, node => node.getAttribute('aria-pressed')), 'true');
    assert.match(await page.$eval(`${panel} .revenue-note`, node => node.innerText), /1\s*150\s*₽.*Вне рабочих часов: 200\s*₽/);
    assert.match(await page.$eval(`${panel} .revenue-hourly-legend`, node => node.innerText), /Наличные\s*100\s*₽.*Безналичные · карта и СБП\s*1\s*050\s*₽/s);
    assert.match(await page.$eval(`${panel} .revenue-hour:first-child`, node => node.innerText), /150\s*₽\s*\(13%\)/);
    const revenueWidths = await page.$$eval(`${panel} .revenue-hour-track > div`, nodes => nodes.map(node => parseFloat(node.style.width)));
    assert.equal(revenueWidths[0], 15);
    assert.equal(revenueWidths[1], 100);
    assert.equal(revenueWidths[2], 0);
    const split = await page.$$eval(`${panel} .revenue-hour:first-child .revenue-hour-track span`, nodes => nodes.map(node => parseFloat(node.style.width)));
    assert.ok(Math.abs(split[0] - 100 / 150 * 100) < .001);
    assert.ok(Math.abs(split[1] - 50 / 150 * 100) < .001);
    assert.equal(split[2], 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `No horizontal overflow at ${width}px`);
    const collisions = await page.$$eval(`${panel} .revenue-hour`, nodes => nodes.some(node => {
      const amount = node.querySelector('strong').getBoundingClientRect();
      const detail = node.querySelector('.revenue-hour-detail').getBoundingClientRect();
      return amount.left < detail.right && amount.right > detail.left && amount.top < detail.bottom && amount.bottom > detail.top;
    }));
    assert.equal(collisions, false, `Amounts and payment details don't overlap at ${width}px`);
    if (process.env.REVENUE_SCREENSHOT_DIR) {
      await mkdir(process.env.REVENUE_SCREENSHOT_DIR, { recursive: true });
      await (await page.$(panel)).screenshot({ path: join(process.env.REVENUE_SCREENSHOT_DIR, `hourly-revenue-${width}.png`) });
    }
    await page.focus(ordersButton);
    await page.keyboard.press('Enter');
    await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true', {}, ordersButton);
    assert.equal(await page.$(`${panel} .revenue-hourly-legend`), null);
    assert.match(await page.$eval(`${panel} .revenue-hour:first-child .revenue-hour-detail`, node => node.innerText), /списаний: 1/);
    console.log(`PASS hourly order/revenue scales, payment split and keyboard at ${width}px`);
  }
  orders = [order('other', { total: 25, paymentMethod: null }), order('bonus', { total: 50, paymentMethod: 'BONUS' })];
  await page.reload({ waitUntil: 'networkidle0' });
  await click(revenueButton);
  assert.match(await page.$eval(`${panel} .revenue-hourly-legend`, node => node.innerText), /Бонусы \/ не указан\s*75\s*₽/);
  assert.equal(await page.$eval(`${panel} .revenue-hour:first-child .revenue-color-other`, node => node.style.width), '100%');
  orders = [];
  await page.reload({ waitUntil: 'networkidle0' });
  await click(revenueButton);
  assert.match(await page.$eval(`${panel} .revenue-note`, node => node.innerText), /Выручка за рабочие часы: 0\s*₽/);
  assert.ok(await page.$$eval(`${panel} .revenue-hour-track > div`, nodes => nodes.every(node => node.style.width === '0%')));
  assert.deepEqual(errors, []);
  console.log('PASS other payment methods and empty hourly chart');
} finally { await browser.close(); }
