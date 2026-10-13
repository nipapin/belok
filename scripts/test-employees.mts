import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';

test('users and employees partition all accounts by USER role without changing accounts', async () => {
  const modulePath = process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath, 'Set INVENTORY_TEST_PGLITE_MODULE; production DB is never accessed');
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users(id text PRIMARY KEY,email text,"emailVerifiedAt" timestamp,phone text,name text,"avatarUrl" text,role text,"bonusBalance" int,"totalSpent" numeric,"loyaltyLevelId" text,"createdAt" timestamp,"updatedAt" timestamp,"passwordHash" text);
      CREATE TABLE app_settings(key text PRIMARY KEY,value jsonb,"updatedAt" timestamp DEFAULT NOW());
      CREATE TABLE loyalty_levels(id text,name text,"minSpent" numeric,"cashbackPercent" numeric,"discountPercent" numeric,"sortOrder" int);
      CREATE TABLE orders(id text,"userId" text);
      INSERT INTO users(id,role,name,"createdAt","passwordHash") VALUES('guest','USER','Гость',NOW(),'private'),('admin','ADMIN','Администратор',NOW(),'private'),('manager','MANAGER','Управляющий',NOW(),'private');`);
    let authorized = true;
    const source = await readFile(new URL('../src/app/api/admin/users/route.ts', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports: { GET?: (request: Request) => Promise<Response> } = {};
    const modules: Record<string, unknown> = {
      'next/server': { NextResponse },
      '@/lib/adminAuth': { requireAdmin: async () => { if (!authorized) throw Error('UNAUTHORIZED'); } },
      '@/lib/db': { query: async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows },
    };
    vm.runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in modules); return modules[name]; }, URL });
    const get = async (scope: string) => exports.GET!(new Request('http://test/api/admin/users' + scope));
    const guests = await (await get('?scope=users')).json();
    assert.deepEqual(guests.users.map((u: { id: string }) => u.id), ['guest']);
    const employees = await (await get('?scope=employees')).json();
    assert.deepEqual(employees.users.map((u: { id: string }) => u.id).sort(), ['admin', 'manager']);
    assert.equal((await (await get('')).json()).users.length, 3, 'Existing callers retain the full list');
    assert.equal((await get('?scope=invalid')).status, 400);
    assert.ok(employees.users.every((u: object) => !('passwordHash' in u)));
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count, 3);
    await db.query(`INSERT INTO app_settings(key,value) VALUES('employee_roles:guest','{"roles":["COOK"]}'::jsonb),('employee_roles:admin','{"roles":["USER"]}'::jsonb)`);
    const reassignedGuests = await (await get('?scope=users')).json();
    assert.deepEqual(reassignedGuests.users.map((u: {id:string})=>u.id), ['admin']);
    const reassignedEmployees = await (await get('?scope=employees')).json();
    assert.deepEqual(reassignedEmployees.users.map((u: {id:string})=>u.id).sort(), ['guest','manager']);
    assert.equal((await db.query("SELECT role FROM users WHERE id='guest'")).rows[0].role, 'USER');
    assert.equal((await db.query("SELECT role FROM users WHERE id='admin'")).rows[0].role, 'ADMIN');
    authorized = false; assert.equal((await get('?scope=employees')).status, 403);
  } finally { await db.close(); }
});

test('order write-offs match registered and guest employee emails with effective role overrides', async () => {
  const modulePath = process.env.INVENTORY_TEST_PGLITE_MODULE;
  assert.ok(modulePath, 'Set INVENTORY_TEST_PGLITE_MODULE; production DB is never accessed');
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users(id text PRIMARY KEY,email text,role text);
      CREATE TABLE app_settings(key text PRIMARY KEY,value jsonb);
      INSERT INTO users VALUES('owner','Owner@Cafe.ru','ADMIN'),('guest','client@cafe.ru','USER'),('cook',' Cook@Cafe.ru ','USER'),('former','former@cafe.ru','ADMIN');
      INSERT INTO app_settings VALUES('employee_roles:cook','{"roles":["COOK"]}'),('employee_roles:former','{"roles":["USER"]}');`);
    const source = await readFile(new URL('../src/lib/orderWriteOff.ts', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports: { employeeEmailSet?: () => Promise<Set<string>>; matchesEmployeeEmail?: (emails: Set<string>, user?: string | null, guest?: string | null) => boolean } = {};
    vm.runInNewContext(code, { exports, require: (name: string) => {
      assert.equal(name, '@/lib/db');
      return { query: async (sql: string) => (await db.query(sql)).rows };
    } });
    const emails = await exports.employeeEmailSet!();
    assert.deepEqual([...emails].sort(), ['cook@cafe.ru', 'owner@cafe.ru']);
    assert.equal(exports.matchesEmployeeEmail!(emails, ' OWNER@CAFE.RU '), true);
    assert.equal(exports.matchesEmployeeEmail!(emails, null, 'cook@cafe.ru'), true);
    assert.equal(exports.matchesEmployeeEmail!(emails, 'client@cafe.ru'), false);
    assert.equal(exports.matchesEmployeeEmail!(emails, 'former@cafe.ru'), false);
    assert.equal(exports.matchesEmployeeEmail!(emails, null, ''), false);
  } finally { await db.close(); }
});
