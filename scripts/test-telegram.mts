import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { validateTelegramInitData, telegramWebhookSecret, validWebhookSecret } from '../src/lib/telegramValidation';
import { telegramOrderText, TelegramApiError } from '../src/lib/telegramBot';
import { NextRequest, NextResponse } from 'next/server';

const token = '123456:test-only-token';
const now = 1_800_000_000_000;
function signed(fields: Record<string, string> = {}) {
  const params = new URLSearchParams({ auth_date: String(now / 1000), user: JSON.stringify({ id: 123, first_name: 'Никита' }), ...fields });
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
async function moduleWithMocks(path: string, mocks: Record<string, unknown>, extra: object = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports: Record<string, (...args: any[]) => any> = {};
  vm.runInNewContext(code, { exports, require: (key: string) => { assert.ok(key in mocks, `Unexpected module: ${key}`); return mocks[key]; },
    process: { env: {} }, console, URL, ...extra });
  return exports;
}

test('Telegram identity requires an intact signature, fresh auth_date and unambiguous user', () => {
  assert.equal(validateTelegramInitData(signed({ signature: 'new-telegram-field' }), token, now).id, 123);
  assert.throws(() => validateTelegramInitData(signed().replace('123', '124'), token, now));
  assert.throws(() => validateTelegramInitData(signed(), 'wrong-token', now));
  assert.throws(() => validateTelegramInitData(signed(), token, now + 601_000));
  assert.throws(() => validateTelegramInitData(signed({ auth_date: String(now / 1000 + 60) }), token, now));
  assert.throws(() => validateTelegramInitData(signed({ auth_date: '0' }), token, now));
  assert.throws(() => validateTelegramInitData(signed({ user: '{' }), token, now));
  assert.throws(() => validateTelegramInitData(signed({ user: '{"id":-1,"first_name":"test"}' }), token, now));
  assert.throws(() => validateTelegramInitData(signed() + '&user=duplicate', token, now));
  assert.throws(() => validateTelegramInitData('x'.repeat(20_000), token, now));
  const secret = telegramWebhookSecret(token);
  assert.equal(validWebhookSecret(secret, token), true);
  for (const value of [null, '', 'x'.repeat(64), 'я'.repeat(64), secret]) {
    assert.equal(validWebhookSecret(value, 'different-token'), false);
  }
});

test('preview, development and build cannot take over the production bot', async () => {
  const worker = await moduleWithMocks('../src/lib/telegramWorker.ts', {
    '@/lib/db': {}, '@/lib/telegramSchema': {}, '@/lib/telegramBot': {},
  });
  const env = { TELEGRAM_BOT_TOKEN: token, NODE_ENV: 'production', PORT: '3000' };
  assert.equal(worker.shouldStartTelegramWorker(env), true);
  for (const changes of [{ PORT: '3010' }, { PORT: '3001' }, { NODE_ENV: 'development' },
    { TELEGRAM_BOT_TOKEN: '' }, { NEXT_PHASE: 'phase-production-build' }, { TELEGRAM_BOT_ENABLED: 'false' }]) {
    assert.equal(worker.shouldStartTelegramWorker({ ...env, ...changes }), false);
  }
  assert.match(telegramOrderText('PENDING', '42'), /№42/);
  assert.doesNotMatch(telegramOrderText('PENDING', '42'), /оплачен/);
});

test('migration queues only linked Telegram orders, survives retry and covers all status writers', async () => {
  const modulePath = process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath, 'Set INVENTORY_TEST_PGLITE_MODULE to an isolated PGlite install');
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const withTransaction = async (fn: (client: unknown) => Promise<unknown>) => db.transaction(async (tx: unknown) => fn(tx));
  try {
    await db.exec(`CREATE TABLE users(id text PRIMARY KEY);
      CREATE TABLE sessions(id text PRIMARY KEY);
      CREATE TABLE orders(id text PRIMARY KEY,status text NOT NULL DEFAULT 'PENDING',"dailyNumber" int);
      INSERT INTO users VALUES('tg-user'); INSERT INTO sessions VALUES('tg-session');`);
    const migration = await readFile(new URL('../migrations/031_telegram_orders.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Also safe for manual migration after runtime startup.
    await db.exec(`INSERT INTO telegram_accounts VALUES(123,'tg-user');
      INSERT INTO telegram_chats VALUES(123,TRUE);
      INSERT INTO telegram_sessions VALUES('tg-session',123);
      INSERT INTO orders(id,"dailyNumber") VALUES('web',1),('telegram',2);
      INSERT INTO telegram_orders VALUES('telegram',123);
      UPDATE orders SET status='PREPARING';
      UPDATE orders SET status='PREPARING';
      UPDATE orders SET status='READY';`);
    const events = (await db.query('SELECT "orderId",status FROM telegram_outbox ORDER BY id')).rows;
    assert.deepEqual(events.map((e: { orderId: string; status: string }) => [e.orderId, e.status]), [
      ['telegram', 'PENDING'], ['telegram', 'PREPARING'], ['telegram', 'READY'],
    ]);
    // A failed order transaction leaves neither order nor notification.
    await assert.rejects(db.transaction(async (tx: any) => {
      await tx.exec(`INSERT INTO orders(id) VALUES('rolled-back'); INSERT INTO telegram_orders VALUES('rolled-back',123);`);
      throw new Error('rollback');
    }));
    assert.equal((await db.query('SELECT id FROM orders WHERE id=$1', ['rolled-back'])).rows.length, 0);
    let fail = false;
    const sent: any[] = [];
    const worker = await moduleWithMocks('../src/lib/telegramWorker.ts', {
      '@/lib/db': { withTransaction }, '@/lib/telegramSchema': {},
      '@/lib/telegramBot': { TelegramApiError, telegramOrderText, telegramAppOrigin: () => 'https://belok.pro',
        telegramCall: async (_: string, body: unknown) => { if (fail) throw new TelegramApiError(429, 90); sent.push(body); } },
    });
    await worker.deliverTelegramOutbox();
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /№2/);
    assert.equal((await db.query('SELECT id FROM telegram_outbox WHERE "sentAt" IS NOT NULL')).rows.length, 1);
    fail = true;
    await worker.deliverTelegramOutbox();
    const retried = (await db.query('SELECT attempts,"sentAt" FROM telegram_outbox WHERE status=$1', ['PREPARING'])).rows[0];
    assert.equal(retried.attempts, 1); assert.equal(retried.sentAt, null);
    fail = false;
    await worker.deliverTelegramOutbox(); // READY is deliverable while PREPARING backs off.
    assert.equal(sent.length, 2);
    await db.exec(`UPDATE telegram_outbox SET "nextAttemptAt"=NOW() WHERE status='PREPARING'`);
    await worker.deliverTelegramOutbox();
    assert.equal(sent.length, 2, 'A stale preparation retry must not arrive after readiness');
    assert.ok((await db.query("SELECT \"discardedAt\" FROM telegram_outbox WHERE status='PREPARING'")).rows[0].discardedAt);
    await db.exec(`UPDATE orders SET status='CANCELLED' WHERE id='telegram'`);
    assert.equal((await db.query("SELECT id FROM telegram_outbox WHERE status='CANCELLED'")).rows.length, 1);
    // Source is independent of bot availability; blocked chats don't receive new events.
    await db.exec(`UPDATE telegram_chats SET active=FALSE; UPDATE orders SET status='COMPLETED' WHERE id='telegram'`);
    assert.equal((await db.query("SELECT id FROM telegram_outbox WHERE status='COMPLETED'")).rows.length, 0);
  } finally { await db.close(); }
});

test('webhook rejects forged messages and groups; /start only replies to its private sender', async () => {
  let messages = 0;
  let writes = 0;
  const api = await moduleWithMocks('../src/app/api/telegram/webhook/route.ts', {
    'next/server': { NextResponse }, '@/lib/db': { query: async () => { writes++; } },
    '@/lib/telegramSchema': { ensureTelegramSchema: async () => {} },
    '@/lib/telegramValidation': { validWebhookSecret },
    '@/lib/telegramBot': { telegramMenuButton: () => ({ text: 'Заказать', web_app: { url: 'https://belok.pro/telegram' } }),
      telegramCall: async () => { messages++; } },
  }, { process: { env: { TELEGRAM_BOT_TOKEN: token } } });
  const post = (body: unknown, secret = telegramWebhookSecret(token)) => api.POST(new NextRequest('https://belok.pro/api/telegram/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(body),
  }));
  const message = { chat: { id: 123, type: 'private' }, from: { id: 123 }, text: '/start' };
  assert.equal((await post({ message }, 'forged')).status, 401);
  await post({ message: { ...message, chat: { id: 123, type: 'group' } } });
  await post({ message: { ...message, from: { id: 999 } } });
  assert.equal(messages, 0); assert.equal(writes, 0);
  assert.equal((await post({ message })).status, 200);
  assert.equal(messages, 1); assert.equal(writes, 1);
});

test('verified Telegram login creates only a USER and reuses its identity without linking browser accounts', async () => {
  const modulePath = process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath);
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE loyalty_levels(id text PRIMARY KEY,"minSpent" int,"sortOrder" int);
      CREATE TABLE users(id text PRIMARY KEY, name text, role text DEFAULT 'USER', email text,"loyaltyLevelId" text);
      CREATE TABLE sessions(id text PRIMARY KEY);
      CREATE TABLE telegram_accounts("telegramId" bigint PRIMARY KEY,"userId" text UNIQUE REFERENCES users(id));
      CREATE TABLE telegram_sessions("sessionId" text PRIMARY KEY,"telegramId" bigint);
      INSERT INTO users(id,name,role,email) VALUES('browser-admin','Admin','ADMIN','admin@example.com');
      INSERT INTO loyalty_levels VALUES('default',0,0);`);
    let sessions = 0;
    const writes: string[] = [];
    const exec = async (sql: string, params?: unknown[]) => {
      writes.push(sql);
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      return db.query(sql, params);
    };
    const api = await moduleWithMocks('../src/app/api/auth/telegram/route.ts', {
      'next/server': { NextResponse }, 'node:crypto': { randomUUID: () => 'created-tg-user' },
      '@/lib/auth': {
        createSession: async () => ({ id: `session-${++sessions}` }),
        getUserWithLoyaltyById: async (id: string) => (await db.query('SELECT * FROM users WHERE id=$1', [id])).rows[0],
        setSessionCookieOnResponse: () => {},
      },
      '@/lib/db': { query: async (sql: string, params: unknown[]) => (await exec(sql, params)).rows,
        withTransaction: async (fn: (client: unknown) => unknown) => fn({ query: exec }) },
      '@/lib/telegramSchema': { ensureTelegramSchema: async () => {} },
      '@/lib/telegramValidation': { validateTelegramInitData: (raw: string, t: string) => validateTelegramInitData(raw, t, now) },
      '@/lib/rateLimit': { clientIpFromHeaders: () => '127.0.0.1', rateLimit: () => ({ allowed: true }) },
      '@/lib/userClient': { toClientUser: (user: unknown) => user },
    }, { process: { env: { TELEGRAM_BOT_TOKEN: token } } });
    const post = (initData: string, origin = 'https://belok.pro') => api.POST(new NextRequest('https://belok.pro/api/auth/telegram', {
      method: 'POST', headers: { origin, 'Content-Type': 'application/json', Cookie: 'belok_session=browser-admin' }, body: JSON.stringify({ initData }),
    }));
    assert.equal((await post(signed(), 'https://attacker.example')).status, 403);
    assert.equal((await post('forged')).status, 401);
    assert.equal(writes.length, 0);
    const first = await post(signed());
    assert.equal(first.status, 200);
    assert.equal((await first.json()).user.role, 'USER');
    assert.equal((await post(signed())).status, 200);
    assert.equal((await db.query('SELECT * FROM users')).rows.length, 2);
    assert.equal((await db.query('SELECT * FROM telegram_accounts')).rows[0].userId, 'created-tg-user');
    assert.equal((await db.query('SELECT * FROM telegram_sessions')).rows.length, 2);
    assert.equal((await db.query("SELECT role FROM users WHERE id='browser-admin'")).rows[0].role, 'ADMIN');
  } finally { await db.close(); }
});
