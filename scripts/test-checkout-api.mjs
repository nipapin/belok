import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run the real order handler against in-memory services; never create bank payments or DB orders.
const directory = await mkdtemp(resolve('node_modules/.checkout-test-'));
const fixture = {
  order: null,
  writes: [],
  cancelled: [],
  bankCalls: 0,
  bank: { paymentUrl: 'https://bank.example/payment', payload: 'https://qr.example/pay', image: '<svg />' },
};
globalThis.__checkoutTest = fixture;
const mocks = {
  '@/lib/auth': `export async function getCurrentUser() { return { id: 'test-user', bonusBalance: 1000 }; }`,
  '@/lib/db': `
    const f = globalThis.__checkoutTest;
    export async function query(sql, params) {
      if (sql.includes('FROM "products"')) return [{ id: 'test-product', price: 100 }];
      if (sql.includes('FROM "product_variants"')) return [];
      f.writes.push({ sql, params });
      return [];
    }
    export async function queryOne() { return f.order; }
    export async function withTransaction(fn) {
      return fn({ query: async (sql, params) => {
        f.writes.push({ sql, params });
        if (sql.includes('INSERT INTO "orders"')) {
          f.order = { id: params[0], total: params[2], fulfillment: params[7],
            deliveryTime: params[9], paymentMethod: params[11], pickupTime: params[12],
            paymentStatus: 'PENDING' };
        }
        return { rows: [] };
      } });
    }`,
  '@/lib/orderNumber': `export async function allocateOrderNumber() { return 42; }`,
  '@/lib/orderNotify': `export async function notifyKitchenNewOrder() {}`,
  '@/lib/orderLoyalty': `export async function settleOrderLoyalty(id, status) { globalThis.__checkoutTest.cancelled.push(status); }`,
  '@/lib/tbank': `export const SBP_MIN_RUBLES = 10; export class TbankError extends Error {} export function isTbankConfigured() { return true; }`,
  '@/lib/tbankPayments': `export async function startTbankPayment() { const f = globalThis.__checkoutTest; f.bankCalls++; return f.bank; }`,
};

try {
  const output = join(directory, 'route.mjs');
  await build({
    entryPoints: ['src/app/api/orders/route.ts'], outfile: output,
    platform: 'node', format: 'esm', bundle: true, packages: 'external',
    plugins: [{ name: 'checkout-fixtures', setup(builder) {
      builder.onResolve({ filter: /^next\/server$/ }, () => ({ path: 'next/server.js', external: true }));
      builder.onResolve({ filter: /^@\/lib\// }, ({ path }) => {
        if (mocks[path]) return { path, namespace: 'fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  const { POST } = await import(pathToFileURL(output));
  const base = { items: [{ productId: 'test-product', quantity: 1 }], fulfillment: 'PICKUP', pickupTime: 'ASAP', paymentMethod: 'SBP' };
  async function submit(overrides = {}) {
    fixture.order = null;
    fixture.writes = [];
    fixture.cancelled = [];
    fixture.bankCalls = 0;
    const response = await POST(new Request('http://localhost/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, ...overrides }),
    }));
    return { status: response.status, ...await response.json() };
  }

  for (const bonusUsed of [0, 100]) {
    const result = await submit({ fulfillment: 'DELIVERY', paymentMethod: 'CASH', bonusUsed,
      deliveryAddress: 'Тестовый адрес', deliveryTime: 'ASAP', contactPhone: '+79991234567' });
    assert.equal(result.status, 400);
    assert.match(result.error, /онлайн-оплата/);
    assert.equal(fixture.writes.length, 0);
    assert.equal(fixture.bankCalls, 0);
  }
  console.log('✓ Delivery rejects cash before writing an order or starting payment');

  for (const pickupTime of ['', 'invalid', new Date(Date.now() - 60_000).toISOString()]) {
    assert.equal((await submit({ pickupTime })).status, 400);
    assert.equal(fixture.writes.length, 0);
  }
  console.log('✓ Pickup rejects missing, invalid and past times');

  const pickupTime = new Date(Date.now() + 3_600_000).toISOString();
  const scheduled = await submit({ pickupTime });
  assert.equal(scheduled.status, 200);
  assert.equal(scheduled.order.pickupTime, pickupTime);
  assert.equal(scheduled.order.deliveryTime, null);
  assert.equal(scheduled.payment.image, '<svg />');
  assert.equal(scheduled.payment.payload, 'https://qr.example/pay');
  console.log('✓ Scheduled pickup is persisted and SBP returns QR image and bank link');

  const cash = await submit({ paymentMethod: 'CASH' });
  assert.equal(cash.status, 200);
  assert.equal(cash.order.pickupTime, 'ASAP');
  assert.equal(cash.payment, null);
  assert.equal(fixture.bankCalls, 0);
  const bonus = await submit({ bonusUsed: 100 });
  assert.equal(bonus.order.paymentMethod, 'BONUS');
  assert.equal(fixture.bankCalls, 0);
  console.log('✓ ASAP pickup supports cash and full bonus payment');

  const delivery = await submit({ fulfillment: 'DELIVERY', deliveryAddress: 'Тестовый адрес',
    deliveryTime: 'ASAP', contactPhone: '+79991234567' });
  assert.equal(delivery.status, 200);
  assert.equal(delivery.order.pickupTime, null);
  assert.equal(delivery.order.deliveryTime, 'ASAP');
  console.log('✓ Delivery keeps its own time and accepts SBP');

  fixture.bank = { paymentUrl: null, payload: null, image: '<svg />' };
  assert.equal((await submit()).status, 200);
  fixture.bank = { paymentUrl: 'https://bank.example/payment', payload: null, image: null };
  assert.equal((await submit()).status, 502);
  assert.deepEqual(fixture.cancelled, ['CANCELLED']);
  console.log('✓ SBP accepts QR-only responses; missing QR data cancels the order and refunds bonuses');

  mocks['@/lib/tbank'] = `
    export function assertTbankSuccess(result, fallback) { if (!result.Success) throw new Error(fallback); }
    export function paymentIdToString(id) { return String(id); }
    export async function tbankInit() { return { Success: true, PaymentId: 'test-payment' }; }
    export async function tbankGetState() { return { Success: false, Status: 'CONFIRMED' }; }
    export async function tbankGetQr(id, type) {
      if (globalThis.__checkoutTest.failQr === type || globalThis.__checkoutTest.failQr === 'ALL') throw new Error('Test bank unavailable');
      return { Success: true, Data: type === 'PAYLOAD' ? 'https://qr.example/pay' : '<svg />' };
    }`;
  const paymentOutput = join(directory, 'payments.mjs');
  await build({
    entryPoints: ['src/lib/tbankPayments.ts'], outfile: paymentOutput,
    platform: 'node', format: 'esm', bundle: true, packages: 'external',
    plugins: [{ name: 'payment-fixtures', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\// }, ({ path }) => {
        if (mocks[path]) return { path, namespace: 'fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  const { startTbankPayment, syncSbpPayment } = await import(pathToFileURL(paymentOutput));
  fixture.failQr = 'IMAGE';
  const linkOnly = await startTbankPayment({ id: 'test-order', total: 100, method: 'sbp' });
  assert.equal(linkOnly.payload, 'https://qr.example/pay');
  assert.equal(linkOnly.image, null);
  fixture.failQr = 'PAYLOAD';
  const imageOnly = await startTbankPayment({ id: 'test-order', total: 100, method: 'sbp' });
  assert.equal(imageOnly.image, '<svg />');
  assert.equal(imageOnly.payload, null);
  fixture.failQr = 'ALL';
  fixture.order = { id: 'test-order', paymentStatus: 'PENDING', tbankPaymentId: 'test-payment' };
  const unavailable = await syncSbpPayment(fixture.order);
  assert.equal(unavailable.paymentStatus, 'PENDING');
  assert.equal(unavailable.bankStatus, null);
  assert.ok(unavailable.error);
  console.log('✓ A failed QR image request preserves the bank link; a failed link preserves the image; failed bank status does not mark an order paid');
} finally {
  delete globalThis.__checkoutTest;
  await rm(directory, { recursive: true, force: true });
}
