import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import puppeteer from 'puppeteer';

const base = process.env.BASE_URL || 'http://localhost:3004';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const secret = process.env.SESSION_SECRET || 'manager-release-ui-test';
const browser = await puppeteer.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await browser.setCookie({ name: 'belok_session', value: 'test.' + createHmac('sha256', secret).update('test').digest('hex'), domain: new URL(base).hostname, path: '/' });
  const account = (id, role, name) => ({ id, role, name, email: id + '@test.invalid', phone: '+79990000000', bonusBalance: 0, totalSpent: 0, loyaltyLevel: null, _count: { orders: 0 } });
  const users = [account('guest', 'USER', 'Гость Тестовый'), account('admin', 'ADMIN', 'Сотрудник Тестовый'), account('manager', 'MANAGER', 'Управляющий Тестовый')];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    const respond = body => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/me') return void respond({ user: account('tester', 'ADMIN', 'Тестер') });
    if (url.pathname === '/api/admin/users') {
      const scope = url.searchParams.get('scope');
      return void respond({ users: users.filter(user => scope === 'users' ? user.role === 'USER' : scope === 'employees' ? user.role !== 'USER' : true) });
    }
    if (url.pathname === '/api/admin/users/admin' && request.method() === 'PUT') {
      const user = users.find(user => user.id === 'admin');
      Object.assign(user, JSON.parse(request.postData()));
      return void respond({ user });
    }
    if (url.pathname === '/api/admin/version') return void respond({ revision: 'local', builtAt: null });
    if (url.pathname.startsWith('/api/')) return void respond({ orders: [], settings: {}, levels: [], notifications: [] });
    void request.continue();
  });
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(base + '/admin/employees', { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.body.innerText.includes('Управляющий Тестовый'));
    let body = await page.$eval('body', element => element.innerText);
    assert.ok(body.includes('Сотрудник Тестовый'));
    assert.ok(!body.includes('Гость Тестовый'));
    assert.ok(body.includes('MANAGER'), 'Non-USER roles besides ADMIN remain employees');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(base + '/admin/users', { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.body.innerText.includes('Гость Тестовый'));
    body = await page.$eval('body', element => element.innerText);
    assert.ok(!body.includes('Сотрудник Тестовый'));
    assert.ok(!body.includes('Управляющий Тестовый'));
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(base + '/admin/employees', { waitUntil: 'networkidle2' });
  await page.waitForSelector('tr button[aria-label="Изменить"]');
  const edit = await page.$('tr button[aria-label="Изменить"]');
  await edit.click();
  await page.waitForSelector('[role="dialog"] select');
  await page.select('[role="dialog"] select', 'USER');
  await page.click('[role="dialog"] button::-p-text(Сохранить)');
  await page.waitForFunction(() => !document.body.innerText.includes('Сотрудник Тестовый'));
  await page.goto(base + '/admin/users', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.includes('Сотрудник Тестовый'));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: employees/customers separation, future non-USER role, role transfer, desktop and mobile layouts; no real API writes.');
} finally { await browser.close(); }
