import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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
  }
  console.log('PASS: actual API requires PIN; signed kiosk session reads kitchen data without customer accounts');
} finally { await pool.end(); }

const fixture = (id, status = 'PENDING') => ({
  id, dailyNumber: Number(id), status, source: 'APP', fulfillment: 'PICKUP',
  paymentMethod: 'CASH', paymentStatus: 'PENDING', total: 690,
  comment: 'Соус отдельно', deliveryAddress: null, deliveryTime: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  items: [{ id: `item-${id}`, name: 'Боул с курицей', quantity: 2,
    customizations: [{ id: `remove-${id}`, action: 'REMOVE', name: 'Лук' }, { id: `add-${id}`, action: 'ADD', name: 'Авокадо' }] }],
});
let snapshot = [fixture('101'), fixture('102', 'PREPARING'), fixture('103', 'READY')];
let offline = false;
let unlocked = false;
let statusFailure = false;
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
    const statusPath = path.match(/^\/api\/order-board\/([^/]+)\/status$/);
    if (statusPath) {
      if (!unlocked) return void respond({ error: 'PIN' }, 401);
      if (statusFailure) return void respond({ error: 'Не удалось изменить статус заказа' }, 503);
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
  await clickText('Включить звук');
  await page.waitForFunction(() => window.__boardSounds === 5);
  snapshot = [...snapshot, fixture('104'), fixture('105'), fixture('106'), fixture('107')];
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 7);
  assert.equal(await page.evaluate(() => window.__boardSounds), 5, 'Five queued orders must share one alarm, without per-order sounds');
  assert.equal(await page.$$eval('.board-card-fresh', (elements) => elements.length), 5);
  assert.deepEqual(await page.$$eval('.board-column-new .board-ticket', (elements) => elements.slice(0, 2).map((element) => element.innerText)), ['#107', '#106'], 'Newest orders must be visible at the top of the column');
  await clickText('отметить просмотренными');
  await page.waitForFunction(() => window.__boardSounds === 10, { timeout: 25_000 });
  assert.equal(await page.$$eval('.board-card-fresh', (elements) => elements.length), 0, 'Acknowledgment removes highlight');
  assert.deepEqual(await page.$$eval('.board-column-new .board-ticket', (elements) => elements.slice(0, 2).map((element) => element.innerText)), ['#107', '#106'], 'Acknowledgment must not change chronological order or silence the queue');
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
  await page.click('[data-order-id="107"] .board-order-action');
  await page.waitForFunction(() => !document.querySelector('[data-order-id="107"]'));
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 6);
  const quietCount = await page.evaluate(() => window.__boardSounds);
  await new Promise((resolve) => setTimeout(resolve, 21_000));
  assert.equal(await page.evaluate(() => window.__boardSounds), quietCount, 'Empty New column must stop reminders');
  offline = true;
  await page.waitForFunction(() => document.body.innerText.includes('Нет связи с сервером'));
  assert.equal(await page.$$eval('.board-card', (elements) => elements.length), 6, 'Retain orders during network failure');
  offline = false;
  snapshot.push(fixture('108'));
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 7 && !document.body.innerText.includes('Нет связи с сервером'));
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
  await page.waitForFunction(() => document.querySelector('.board-bottom').innerText.includes('каждые 5 сек.'));
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
  await page.waitForFunction(() => document.querySelectorAll('.board-card').length === 7);
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
  await page.screenshot({ path: 'artifacts/order-board/mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile must not overflow horizontally');
  await page.click('[aria-label="Заблокировать экран"]');
  await page.waitForFunction(() => document.body.innerText.includes('Введите тот же PIN'));
  await page.reload({ waitUntil: 'networkidle2' });
  assert.ok((await page.$eval('body', (body) => body.innerText)).includes('Введите тот же PIN'));
  assert.deepEqual(errors, []);
  console.log('PASS: PIN, today/newest first, compact header, status workflow, one repeating queue alarm without overlap, offline recovery, custom audio, mobile layout, persistent lock');
} finally { await browser.close(); }
