import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import puppeteer from 'puppeteer';

// Use an isolated dev server with SESSION_SECRET=checkout-browser-test-secret.
// All API and bank requests are intercepted; no real orders or payments are made.
const base = process.env.BASE_URL || 'http://localhost:3104';
const bankLink = 'https://qr.example/pay';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="264" height="264"><rect width="264" height="264" fill="black" /></svg>';
const user = { id: 'test-user', name: 'Тест', email: null, phone: '+79991234567',
  role: 'USER', bonusBalance: 0, loyaltyLevel: null };
const item = { id: 'test-line', productId: 'test-product', name: 'Тестовое блюдо', image: null,
  basePrice: 100, quantity: 1, customizations: [] };
const sessionId = 'checkout-test';
const signature = createHmac('sha256', 'checkout-browser-test-secret').update(sessionId).digest('hex');
const browser = await puppeteer.launch({ headless: true });
try {
  for (const device of ['android', 'ios', 'desktop']) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: device !== 'desktop', hasTouch: device !== 'desktop' });
    if (device === 'android') await page.setUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36');
    if (device === 'ios') await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
    await page.emulateTimezone('Europe/Kaliningrad');
    await context.setCookie({ name: 'belok_session', value: `${sessionId}.${signature}`, url: base });
    await page.evaluateOnNewDocument((cartItem) => {
      if (!sessionStorage.getItem('fixture-initialized')) {
        localStorage.setItem('belok-cart', JSON.stringify({ state: { items: [cartItem] }, version: 1 }));
        sessionStorage.setItem('fixture-initialized', '1');
      }
      const OriginalDate = Date;
      const fixed = OriginalDate.parse('2026-10-02T10:00:00.000Z');
      window.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : [fixed])); }
        static now() { return fixed; }
      };
    }, item);
    let submitted;
    let order;
    let paid = false;
    let statusUnavailable = false;
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const url = new URL(request.url());
      const respond = (data) => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.hostname === 'qr.example') {
        return request.respond({ status: 200, contentType: 'text/html', body: '<h1>Test bank</h1>' });
      }
      if (url.pathname === '/api/auth/me') return respond({ user });
      if (url.pathname === '/api/orders' && request.method() === 'POST') {
        submitted = JSON.parse(request.postData());
        order = { id: 'test-order', dailyNumber: 42, status: 'PENDING', paymentStatus: 'PENDING',
          tbankPaymentId: 'test-payment', total: 100, discountAmount: 0, bonusUsed: 0, bonusEarned: 0,
          fulfillment: submitted.fulfillment, pickupTime: submitted.pickupTime, paymentMethod: submitted.paymentMethod,
          createdAt: '2026-10-02T10:00:00Z', items: [{ id: 'test-item', quantity: 1, unitPrice: 100,
            product: { name: item.name, image: null }, customizations: [] }] };
        return respond({ order, payment: { paymentUrl: 'https://bank.example/generic', payload: bankLink, image: svg } });
      }
      if (url.pathname === '/api/orders/test-order') return respond({ order: { ...order, paymentStatus: paid ? 'SUCCEEDED' : 'PENDING' } });
      if (url.pathname === '/api/orders/test-order/payment') {
        if (statusUnavailable) return request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Test service unavailable' }) });
        return respond({ paymentStatus: paid ? 'SUCCEEDED' : 'PENDING', payload: bankLink, image: svg });
      }
      if (url.pathname.startsWith('/api/')) return respond({ orders: [], addresses: [], config: { enabled: false, slides: [] } });
      return request.continue();
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    async function clickText(text) {
      await page.waitForFunction((label) => Array.from(document.querySelectorAll('button')).some((node) => node.textContent.trim() === label), {}, text);
      await page.evaluate((label) => Array.from(document.querySelectorAll('button')).find((node) => node.textContent.trim() === label).click(), text);
    }
    await page.goto(`${base}/cart`, { waitUntil: 'networkidle2' });
    await clickText('Оформить заказ');
    await page.waitForFunction(() => document.body.textContent.includes('Время самовывоза'));
    await clickText('Наличными');
    await clickText('Доставка');
    assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('button')).some((node) => node.textContent.trim() === 'Наличными')), false);
    await page.waitForFunction(() => document.body.textContent.includes('Оплатить через СБП'));
    await clickText('Самовывоз');
    await clickText('Ко времени');
    await clickText('14:00');
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find((node) => node.textContent.includes('Оплатить через СБП')).click());
    if (device === 'desktop') {
      await page.waitForFunction(() => location.pathname === '/orders/test-order');
      await page.waitForSelector('a[href="https://qr.example/pay"]');
      assert.ok(await page.$('svg[shape-rendering="crispEdges"]'));
    } else {
      await page.waitForFunction(() => location.hostname === 'qr.example');
      assert.equal(page.url(), bankLink);
      await page.evaluate(() => window.history.back());
      await page.waitForFunction(() => location.pathname === '/orders/test-order');
      await page.waitForSelector('a[href="https://qr.example/pay"]');
    }
    assert.equal(submitted.paymentMethod, 'SBP');
    assert.equal(submitted.items[0].variantId, null);
    assert.equal(submitted.pickupTime, '2026-10-02T12:00:00.000Z');
    assert.ok(await page.evaluate(() => document.body.textContent.includes('Время самовывоза:')));
    if (device === 'desktop') {
      statusUnavailable = true;
      await page.reload({ waitUntil: 'networkidle2' });
      await page.waitForSelector('[role="alert"]');
      statusUnavailable = false;
      await clickText('Обновить оплату');
      await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
      console.log('✓ Payment status errors show a retry action and recover after retry');
    }
    paid = true;
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.body.textContent.includes('Оплата: Оплачен'));
    assert.equal(await page.$('a[href="https://qr.example/pay"]'), null);
    assert.deepEqual(errors, []);
    console.log(`✓ ${device}: delivery has no cash, pickup time is sent, SBP works, order is restored and paid status displays`);
    await context.close();
  }
} finally {
  await browser.close();
}
