import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';
import { isStaff } from '../src/lib/roles';

function load(path: string, globals: Record<string, unknown>) {
  const exports: Record<string, (...args: never[]) => Promise<unknown>> = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, ...globals });
  return exports;
}

test('refreshes the current page in browsers without a service worker', async () => {
  let reloads = 0;
  const app = load('src/lib/adminApplicationUpdate.ts', {
    fetch: async () => ({ ok: true }), navigator: {},
    window: { location: { reload: () => reloads++ } },
  });
  await app.updateAdminApplication();
  assert.equal(reloads, 1);
});

test('waits for worker activation before reloading; preserves data and subscriptions', async () => {
  let reloads = 0;
  let listener: (() => void) | undefined;
  const worker = {
    state: 'installed',
    addEventListener: (_: string, callback: () => void) => { listener = callback; },
    removeEventListener: () => {},
    postMessage: (message: { type: string }) => {
      assert.equal(message.type, 'SKIP_WAITING');
      assert.equal(reloads, 0);
      worker.state = 'activated';
      listener!();
    },
  };
  const app = load('src/lib/adminApplicationUpdate.ts', {
    fetch: async () => ({ ok: true }),
    navigator: { serviceWorker: { getRegistration: async () => ({ update: async () => {}, waiting: worker }) } },
    window: { setTimeout, clearTimeout, location: { reload: () => reloads++ } },
  });
  await app.updateAdminApplication();
  assert.equal(reloads, 1);
});

test('offline and failed worker updates leave the current page open', async () => {
  for (const offline of [true, false]) {
    let reloads = 0;
    const app = load('src/lib/adminApplicationUpdate.ts', {
      fetch: async () => ({ ok: !offline }),
      navigator: { serviceWorker: { getRegistration: async () => ({ update: async () => { throw Error('offline'); } }) } },
      window: { location: { reload: () => reloads++ } },
    });
    await assert.rejects(app.updateAdminApplication());
    assert.equal(reloads, 0);
  }
});

test('version checks allow all staff roles but reject clients and anonymous users', async () => {
  let user: { role: string; staffRoles?: string[] } | null = null;
  const version = { revision: 'test', builtAt: null, version: '1.0.0' };
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse }, '@/lib/auth': { getCurrentUser: async () => user },
    '@/lib/roles': { isStaff }, '@/lib/buildVersion': { buildVersion: version },
  };
  const route = load('src/app/api/admin/version/route.ts', {
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  for (const role of ['ADMIN', 'OWNER', 'MANAGER', 'CASHIER', 'COOK', 'STOCKKEEPER']) {
    user = { role };
    const response = await route.GET() as Response;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.deepEqual(await response.json(), version);
  }
  for (const denied of [null, { role: 'USER' }, { role: 'ADMIN', staffRoles: ['USER'] }]) {
    user = denied;
    assert.equal((await route.GET() as Response).status, 403);
  }
});
