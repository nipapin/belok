import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ quiet: true });
const base = process.env.BASE_URL || 'http://localhost:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
try {
  assert.equal((await fetch(`${base}/api/order-board`)).status, 401);
  assert.equal((await fetch(`${base}/api/order-board/nonexistent-test-order/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PREPARING' }) })).status, 401);
  assert.equal((await fetch(`${base}/api/order-board/nonexistent-test-order/items/nonexistent-item`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare', preparedQuantity: 0 }) })).status, 401);
  const subdomain = await new Promise((resolve, reject) => {
    http.get(`${base}/`, { headers: { host: 'orders.belok.pro' } }, (response) => {
      let body = ''; response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
  assert.equal(subdomain.status, 200, 'Subdomain root must open the board, without a menu redirect');
  assert.ok(subdomain.body.includes('Экран заказов'));
  const { rows } = await pool.query('SELECT value FROM "app_settings" WHERE key = $1', ['kiosk']);
  if (rows[0]?.value?.pinHash) {
    const cookie = createHmac('sha256', process.env.SESSION_SECRET || process.env.JWT_SECRET).update(`kiosk:${rows[0].value.pinHash}`).digest('hex');
    const response = await fetch(`${base}/api/order-board`, { headers: { cookie: `belok_kiosk=${cookie}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const statusRequest = (status) => fetch(`${base}/api/order-board/nonexistent-test-order/status`, { method: 'PATCH', headers: { cookie: `belok_kiosk=${cookie}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    assert.equal((await statusRequest('CANCELLED')).status, 400, 'Kitchen cannot cancel or refund orders');
    assert.equal((await statusRequest('PREPARING')).status, 404, 'Valid transition query must handle a missing ID without modifying real orders');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kaliningrad' }).format(new Date());
    const boardOrders = (await response.json()).orders;
    for (let index = 1; index < boardOrders.length; index++) {
      assert.ok(new Date(boardOrders[index - 1].createdAt).getTime() >= new Date(boardOrders[index].createdAt).getTime(), 'API must return newest orders first');
    }
    for (const order of boardOrders) {
      assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kaliningrad' }).format(new Date(order.createdAt)), today, 'Historical unfinished orders must not appear on today’s board');
      assert.ok(!['COMPLETED', 'CANCELLED'].includes(order.status));
      assert.ok(order.paymentStatus === 'SUCCEEDED' || ['CASH', 'BONUS', null].includes(order.paymentMethod));
      assert.equal('userId' in order, false);
      assert.equal('tbankPaymentId' in order, false);
    }
    const expected = await pool.query(`SELECT id FROM "orders"
      WHERE status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY')
        AND ("paymentStatus" = 'SUCCEEDED' OR ("paymentStatus" = 'PENDING' AND ("paymentMethod" IN ('CASH', 'BONUS') OR "paymentMethod" IS NULL)))
        AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kaliningrad')::date = $1::date`, [today]);
    assert.deepEqual(boardOrders.map((order) => order.id).sort(), expected.rows.map((order) => order.id).sort(), 'Include all eligible orders for the current Kaliningrad day');
    console.log(`PASS: today’s board contains ${boardOrders.length} eligible orders; historical orders excluded`);
    if (['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
      const orderId = `board-test-${randomUUID()}`;
      const otherOrderId = `board-test-${randomUUID()}`;
      const itemId = `board-test-${randomUUID()}`;
      const secondItemId = `board-test-${randomUUID()}`;
      const product = (await pool.query('SELECT id FROM products LIMIT 1')).rows[0];
      assert.ok(product, 'A product is needed for the isolated progress fixture');
      try {
        await pool.query(`INSERT INTO orders (id, total, source, "paymentMethod") VALUES ($1, 0, 'KIOSK', 'CASH'), ($2, 0, 'KIOSK', 'CASH')`, [orderId, otherOrderId]);
        await pool.query(`INSERT INTO order_items (id, "orderId", "productId", quantity, "unitPrice") VALUES ($1, $2, $3, 2, 0)`, [itemId, orderId, product.id]);
        await pool.query(`INSERT INTO order_items (id, "orderId", "productId", quantity, "unitPrice") VALUES ($1, $2, $3, 1, 0)`, [secondItemId, orderId, product.id]);
        const mark = (action, preparedQuantity, targetOrderId = orderId, targetItemId = itemId) => fetch(`${base}/api/order-board/${targetOrderId}/items/${targetItemId}`, {
          method: 'PATCH', headers: { cookie: `belok_kiosk=${cookie}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, preparedQuantity }),
        });
        assert.equal((await mark('invalid', 0)).status, 400);
        assert.equal((await mark('prepare', 0.5)).status, 400);
        assert.equal((await mark('prepare', -1)).status, 400);
        assert.equal((await mark('prepare', Number.MAX_SAFE_INTEGER)).status, 400);
        assert.equal((await mark('prepare', 0)).status, 409, 'New orders must be accepted before item preparation');
        await pool.query(`UPDATE orders SET status='PREPARING' WHERE id=$1`, [orderId]);
        assert.equal((await mark('prepare', 0, otherOrderId)).status, 409, 'Items cannot be marked through another order');
        const simultaneous = await Promise.all([mark('prepare', 0), mark('prepare', 0)]);
        assert.deepEqual(simultaneous.map((response) => response.status).sort(), [200, 409], 'Concurrent clicks/retries mark only one unit');
        const currentBoard = await fetch(`${base}/api/order-board`, { headers: { cookie: `belok_kiosk=${cookie}` } });
        assert.equal((await currentBoard.json()).orders.find((order) => order.id === orderId).items.find((item) => item.id === itemId).preparedQuantity, 1);
        assert.equal((await mark('prepare', 1)).status, 200);
        assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1', [orderId])).rows[0].status, 'PREPARING', 'All positions must be complete before Ready');
        const lastPosition = await mark('prepare', 0, orderId, secondItemId);
        assert.equal(lastPosition.status, 200);
        assert.equal((await lastPosition.json()).order.status, 'READY', 'Last unit must atomically move the order to Ready');
        assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1', [orderId])).rows[0].status, 'READY');
        assert.equal((await mark('prepare', 2)).status, 409, 'Cannot exceed ordered quantity');
        assert.equal((await mark('undo', 2)).status, 200);
        assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1', [orderId])).rows[0].status, 'PREPARING', 'Undo must return the order to Cooking');
        assert.equal((await mark('undo', 1)).status, 200);
        assert.equal((await mark('undo', 0)).status, 409, 'Cannot undo below zero');
        for (const status of ['COMPLETED', 'CANCELLED']) {
          await pool.query('UPDATE orders SET status=$2 WHERE id=$1', [orderId, status]);
          assert.equal((await mark('prepare', 0)).status, 409, 'Closed orders cannot be marked');
        }
        await pool.query(`UPDATE orders SET status='PREPARING', "createdAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '2 days' WHERE id=$1`, [orderId]);
        assert.equal((await mark('prepare', 0)).status, 409, 'Historical orders cannot be marked');
        await pool.query(`UPDATE orders SET "createdAt"=CURRENT_TIMESTAMP AT TIME ZONE 'UTC', "paymentMethod"='CARD' WHERE id=$1`, [orderId]);
        assert.equal((await mark('prepare', 0)).status, 409, 'Unpaid online orders cannot be marked');
        console.log('PASS: real item API enforces PIN, ownership, concurrency, bounds and kitchen eligibility; counts persist');
      } finally {
        await pool.query('DELETE FROM orders WHERE id = ANY($1::text[])', [[orderId, otherOrderId]]);
      }
    }
  }
  console.log('PASS: actual API requires PIN; signed kiosk session reads kitchen data without customer accounts');
} finally { await pool.end(); }

const fixture = (id, status = 'PENDING') => ({
  id, dailyNumber: Number(id), status, source: 'APP', fulfillment: 'PICKUP',
  paymentMethod: 'CASH', paymentStatus: 'PENDING', total: 690,
  comment: 'Соус отдельно', deliveryAddress: null, deliveryTime: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  items: [{ id: `item-${id}`, name: 'Боул с курицей', quantity: 2, preparedQuantity: 0,
    customizations: [{ id: `remove-${id}`, action: 'REMOVE', name: 'Лук' }, { id: `add-${id}`, action: 'ADD', name: 'Авокадо' }] }],
});
let snapshot = [fixture('101'), fixture('102', 'PREPARING'), fixture('103', 'READY')];
let offline = false;
let unlocked = false;
let statusFailure = false;
let itemFailure = false;
const failedStatusIds = new Set();
const browser = await puppeteer.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1600, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    window.__boardSounds = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) { window.__boardSounds++; return start.apply(this, args); };
    const oscillatorStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { window.__boardSounds++; return oscillatorStart.apply(this, args); };
  });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    const respond = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/kiosk/session') return void respond({ configured: true, unlocked });
    if (path === '/api/kiosk/unlock') {
      unlocked = JSON.parse(request.postData()).pin === '1234';
      return void respond(unlocked ? { unlocked: true } : { error: 'Неверный PIN' }, unlocked ? 200 : 401);
    }
    if (path === '/api/order-board') {
      if (request.method() === 'DELETE') { unlocked = false; return void respond({ unlocked: false }); }
      if (!unlocked) return void respond({ error: 'PIN' }, 401);
      if (offline) return void respond({ error: 'offline' }, 503);
      return void respond({ orders: snapshot });
    }
    const itemPath = path.match(/^\/api\/order-board\/([^/]+)\/items\/([^/]+)$/);
    if (itemPath) {
      if (!unlocked) return void respond({ error: 'PIN' }, 401);
      if (itemFailure) return void respond({ error: 'Не удалось отметить позицию' }, 503);
      const order = snapshot.find((order) => order.id === itemPath[1]);
      const item = order?.items.find((item) => item.id === itemPath[2]);
      const body = JSON.parse(request.postData());
      const next = (item?.preparedQuantity ?? 0) + (body.action === 'prepare' ? 1 : -1);
      if (!item || item.preparedQuantity !== body.preparedQuantity || next < 0 || next > item.quantity) return void respond({ error: 'Позиция уже изменена' }, 409);
      item.preparedQuantity = next;
      if (body.action === 'prepare' && order.items.every((item) => item.preparedQuantity === item.quantity)) order.status = 'READY';
      else if (body.action === 'undo' && order.status === 'READY') order.status = 'PREPARING';
      return void respond({ item: { id: item.id, preparedQuantity: next }, order: { id: order.id, status: order.status } });
    }
    const statusPath = path.match(/^\/api\/order-board\/([^/]+)\/status$/);
    if (statusPath) {
      if (!unlocked) return void respond({ error: 'PIN' }, 401);
      if (statusFailure || failedStatusIds.has(statusPath[1])) return void respond({ error: 'Не удалось изменить статус заказа' }, 503);
      const id = statusPath[1];
      const status = JSON.parse(request.postData()).status;
      const current = snapshot.find((order) => order.id === id);
      const previous = { PREPARING: ['PENDING', 'CONFIRMED'], READY: ['PREPARING'], COMPLETED: ['READY'] }[status];
      if (!current || !previous?.includes(current.status)) return void respond({ error: 'Заказ уже изменён' }, 409);
      snapshot = status === 'COMPLETED' ? snapshot.filter((order) => order.id !== id) : snapshot.map((order) => order.id === id ? { ...order, status } : order);
      return void respond({ order: { id, status } });
    }
    void request.continue();
  });
  const clickText = async (text) => {
    const button = await page.waitForSelector(`::-p-text(${text})`);
    await button.click();
  };
  await page.goto(`${base}/order-board`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.includes('Введите тот же PIN'));
  for (const digit of ['1', '2', '3', '4']) await clickText(digit);
  await clickText('OK');
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 3);
  assert.equal(await page.evaluate(() => window.__boardSounds), 0, 'Initial snapshot must be silent');
  assert.ok((await page.$eval('.board-items', (element) => element.innerText)).includes('Без Лук'));
  assert.equal(await page.$('.board-summary'), null);
  assert.equal(await page.$('.board-bottom'), null);
  assert.ok(await page.$('.board-header time'), 'Clock must be in the header');
  assert.equal(await page.$('.board-column-new .board-items'), null, 'New orders must show only compact accept buttons');
  assert.equal(await page.$eval('.board-column-new .board-accept', (button) => button.innerText.replace(/\s+/g, ' ')), 'Заказ №101 Принять');
  const position = '[data-order-id="102"] [data-item-id="item-102"]';
  itemFailure = true;
  await page.click(`${position} .board-item`);
  await page.waitForFunction(() => document.body.innerText.includes('Не удалось отметить позицию'));
  assert.equal(await page.$eval(`${position} .board-quantity`, (element) => element.innerText), '×2');
  itemFailure = false;
  await page.click(`${position} .board-item`);
  await page.waitForFunction(() => document.querySelector('[data-item-id="item-102"] .board-quantity').innerText === '×1');
  await page.click(`${position} .board-item-undo`);
  await page.waitForFunction(() => document.querySelector('[data-item-id="item-102"] .board-quantity').innerText === '×2');
  for (let prepared = 1; prepared <= 2; prepared++) {
    await page.click(`${position} .board-item`);
    await page.waitForFunction((prepared) => document.querySelector('[data-item-id="item-102"] .board-item').disabled === (prepared === 2) && (prepared === 2 || document.querySelector('[data-item-id="item-102"] .board-quantity').innerText === '×1'), {}, prepared);
  }
  assert.ok(await page.$(`${position}.board-item-done`));
  assert.ok(await page.$('.board-column-ready [data-order-id="102"]'), 'Last unit must immediately move the card to Ready');
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector(`${position}.board-item-done`);
  assert.equal(await page.$eval(`${position} .board-item`, (button) => button.disabled), true);
  await page.click(`${position} .board-item-undo`);
  await page.waitForFunction(() => document.querySelector('[data-item-id="item-102"] .board-quantity').innerText === '×1');
  assert.ok(await page.$('.board-column-cooking [data-order-id="102"]'), 'Undo returns the card to Cooking');
  const quantityIsRight = await page.$eval(`${position} .board-item`, (button) => button.firstElementChild.getBoundingClientRect().right <= button.lastElementChild.getBoundingClientRect().left);
  assert.ok(quantityIsRight, 'Quantity must be aligned to the right of the item name');
  console.log('PASS: item quantities decrement one at a time, completed items disable, undo/reload work, failed mutations retain counts');
  await clickText('Включить звук');
  await page.waitForFunction(() => window.__boardSounds === 5);
  snapshot = [...snapshot, fixture('104'), fixture('105'), fixture('106'), fixture('107')];
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 7);
  assert.equal(await page.evaluate(() => window.__boardSounds), 5, 'Five queued orders must share one alarm, without per-order sounds');
  assert.equal(await page.$$eval('.board-card-fresh', (elements) => elements.length), 5);
  assert.deepEqual(await page.$$eval('.board-column-new .board-ticket', (elements) => elements.slice(0, 2).map((element) => element.innerText)), ['Заказ №107', 'Заказ №106'], 'Newest orders must be visible at the top of the column');
  await page.waitForFunction(() => window.__boardSounds === 10, { timeout: 25_000 });
  assert.equal(await page.$$eval('.board-card-fresh', (elements) => elements.length), 5, 'Pending orders stay highlighted until accepted');
  assert.deepEqual(await page.$$eval('.board-column-new .board-ticket', (elements) => elements.slice(0, 2).map((element) => element.innerText)), ['Заказ №107', 'Заказ №106'], 'Repeating sound must not change chronological order');
  await new Promise((resolve) => setTimeout(resolve, 3500));
  assert.equal(await page.evaluate(() => window.__boardSounds), 10, 'Polling must not produce extra alarms');
  statusFailure = true;
  await page.click('[data-order-id="107"] .board-order-action');
  await page.waitForFunction(() => document.body.innerText.includes('Не удалось изменить статус заказа'));
  assert.ok(await page.$('.board-column-new [data-order-id="107"]'), 'Failed status change must retain the order in New');
  statusFailure = false;
  for (const id of ['107', '106', '105', '104', '101']) {
    await page.click(`[data-order-id="${id}"] .board-order-action`);
    await page.waitForFunction((id) => !!document.querySelector(`.board-column-cooking [data-order-id="${id}"]`), {}, id);
  }
  assert.equal(await page.$eval('.board-column-new', (element) => element.querySelectorAll('.board-card').length), 0);
  console.log('PASS: five new orders share one repeating alarm; viewed does not silence it; buttons move orders and failures retain cards');
  await page.click('[data-order-id="107"] .board-order-action');
  await page.waitForFunction(() => !!document.querySelector('.board-column-ready [data-order-id="107"]'));
  failedStatusIds.add('103');
  await page.click('[aria-label="Выдать все готовые заказы"]');
  await page.waitForFunction(() => !document.querySelector('[data-order-id="107"]'));
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 6);
  await page.waitForFunction(() => document.body.innerText.includes('Выдано заказов: 1 из 2.'));
  assert.ok(await page.$('.board-column-ready [data-order-id="103"]'), 'Bulk completion must retain failed orders');
  failedStatusIds.clear();
  await page.click('[aria-label="Выдать все готовые заказы"]');
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 5);
  assert.equal(await page.$eval('[aria-label="Выдать все готовые заказы"]', (button) => button.disabled), true);
  console.log('PASS: bulk completes only Ready orders, retains failures and disables when the column is empty');
  const quietCount = await page.evaluate(() => window.__boardSounds);
  await new Promise((resolve) => setTimeout(resolve, 21_000));
  assert.equal(await page.evaluate(() => window.__boardSounds), quietCount, 'Empty New column must stop reminders');
  offline = true;
  await page.waitForFunction(() => document.body.innerText.includes('Нет связи с сервером'));
  assert.equal(await page.$$eval('.board-card', (elements) => elements.length), 5, 'Retain orders during network failure');
  offline = false;
  snapshot.push(fixture('108'));
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 6 && !document.body.innerText.includes('Нет связи с сервером'));
  assert.equal(await page.evaluate(() => window.__boardSounds), quietCount + 5, 'A new queue restarts one alarm');
  await mkdir('artifacts/order-board', { recursive: true });
  await page.screenshot({ path: 'artifacts/order-board/desktop.png' });
  const sampleRate = 8000;
  const wav = Buffer.alloc(44 + sampleRate * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(sampleRate * 2, 40);
  for (let i = 0; i < sampleRate; i++) wav.writeInt16LE(Math.round(Math.sin(i / sampleRate * 2 * Math.PI * 660) * 3000), 44 + i * 2);
  await writeFile('artifacts/order-board/test-sound.wav', wav);
  await clickText('Настройки звука');
  const soundInput = await page.$('input[type="file"]');
  await soundInput.uploadFile('artifacts/order-board/test-sound.wav');
  await page.waitForFunction(() => document.body.innerText.includes('Звук сохранён'));
  const setRepeat = async (value) => {
    await page.$eval('input[aria-label="Период повтора в секундах"]', (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  };
  assert.equal(await page.$eval('input[type="number"]', (input) => input.value), '20');
  await setRepeat('5');
  await page.waitForFunction(() => document.querySelector('input[type="number"]').value === '5');
  const beforeRepeat = await page.evaluate(() => window.__boardSounds);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  assert.equal(await page.evaluate(() => window.__boardSounds), beforeRepeat, 'Changing interval must not trigger an immediate extra sound');
  await page.waitForFunction((count) => window.__boardSounds === count + 1, { timeout: 6000 }, beforeRepeat);
  await setRepeat('0');
  await page.focus('input[type="number"]');
  await page.focus('input[type="range"]');
  assert.equal(await page.$eval('input[type="number"]', (input) => input.value), '5', 'Invalid interval must revert to the last valid value');
  assert.equal(await page.evaluate(() => localStorage.getItem('belok-board-repeat-seconds')), '5');
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 6);
  assert.equal(await page.evaluate(() => window.__boardSounds), 0, 'Reload must require a new gesture for audio');
  await clickText('Настройки звука');
  await page.waitForFunction(() => document.body.innerText.includes('test-sound.wav'));
  assert.equal(await page.$eval('input[type="number"]', (input) => input.value), '5', 'Repeat interval must survive reload');
  await clickText('Включить звук');
  await page.waitForFunction(() => window.__boardSounds === 1);
  await page.waitForFunction(() => window.__boardSounds === 2, { timeout: 8000 });
  console.log('PASS: configurable repeat interval applies to active alarms, validates input and persists after reload');
  await clickText('Настройки звука');
  await page.setViewport({ width: 390, height: 844 });
  await clickText('Настройки звука');
  await page.screenshot({ path: 'artifacts/order-board/mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile must not overflow horizontally');
  await page.click('[aria-label="Заблокировать экран"]');
  await page.waitForFunction(() => document.body.innerText.includes('Введите тот же PIN'));
  await page.reload({ waitUntil: 'networkidle2' });
  assert.ok((await page.$eval('body', (body) => body.innerText)).includes('Введите тот же PIN'));
  assert.deepEqual(errors, []);
  console.log('PASS: PIN, today/newest first, compact header, status workflow, one repeating queue alarm without overlap, offline recovery, custom audio, mobile layout, persistent lock');
} finally { await browser.close(); }
