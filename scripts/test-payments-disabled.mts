import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paymentsDisabled, requirePaymentsEnabled } from '../src/lib/paymentMode';

test('disabled dev payments never contact providers or change payment queues', async () => {
  const saved = {...process.env};
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let queries = 0;
  Object.assign(process.env, {
    NODE_ENV: 'production', BELOK_PAYMENTS_DISABLED: 'true', NEXT_PUBLIC_PAYMENTS_DISABLED: 'false',
    DATABASE_URL: 'postgresql://disabled:disabled@127.0.0.1:1/disabled',
    TBANK_TERMINAL_KEY: 'test-only', TBANK_PASSWORD: 'test-only', AQSI_API_KEY: 'test-only', AQSI_WORKER_ENABLED: 'true',
  });
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected provider request'); };
  const db = await import('../src/lib/db');
  const originalQuery = db.pool.query;
  const originalConnect = db.pool.connect;
  db.pool.query = (() => { queries++; throw new Error('Unexpected database query'); }) as typeof db.pool.query;
  db.pool.connect = (() => { queries++; throw new Error('Unexpected database connection'); }) as typeof db.pool.connect;
  try {
    const bank = await import('../src/lib/tbank');
    const aqsi = await import('../src/lib/aqsi');
    const jobs = await import('../src/lib/aqsiJobs');
    const cash = await import('../src/lib/aqsiCashOrders');
    const catalog = await import('../src/lib/aqsiCatalog');
    const worker = await import('../src/lib/aqsiWorker');
    const bankPayments = await import('../src/lib/tbankPayments');
    assert.equal(bank.isTbankConfigured(), false);
    await assert.rejects(bank.tbankGetState('test-only'), /отключены/);
    await assert.rejects(bank.tbankCancel('test-only'), /отключены/);
    await assert.rejects(aqsi.aqsiRequest('/v4/Receipts/process', 'POST', {}), /отключены/);
    await assert.rejects(bankPayments.applyTbankPaymentStatus('test-only', 'CONFIRMED'), /отключены/);
    await assert.rejects(jobs.retryAqsiReceipt('test-only'), /отключены/);
    await assert.rejects(jobs.cancelAqsiCard('test-only'), /отключены/);
    const client = {query: () => {queries++; throw new Error('Unexpected enqueue');}} as unknown as import('pg').PoolClient;
    await assert.rejects(jobs.enqueueCard(client, 'test-only', 100, 123), /отключены/);
    await jobs.enqueueReceipt(client, 'test-only');
    await cash.enqueueCashOrder(client, 'test-only', 123);
    await jobs.processAqsiJobs();
    await cash.processAqsiCashOrders();
    await catalog.processAqsiCatalog();
    worker.startAqsiWorker();
    assert.notEqual(globalThis.__aqsiWorkerStarted, true);
    const notify = await import('../src/app/api/payments/tbank/notify/route');
    const response = await notify.POST(new Request('http://localhost/api/payments/tbank/notify', {method:'POST',body:'{}'}) as import('next/server').NextRequest);
    assert.equal(response.status, 503);
    assert.equal(requests, 0);
    assert.equal(queries, 0);
    process.env.BELOK_PAYMENTS_DISABLED = 'false';
    assert.equal(paymentsDisabled(), false);
    assert.equal(bank.isTbankConfigured(), true);
    assert.doesNotThrow(requirePaymentsEnabled);
    Object.assign(process.env, {NODE_ENV: 'development'});
    assert.equal(paymentsDisabled(), true);
    assert.throws(requirePaymentsEnabled, /отключены/);
  } finally {
    globalThis.fetch = originalFetch;
    db.pool.query = originalQuery;
    db.pool.connect = originalConnect;
    await db.pool.end();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
