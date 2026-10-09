import assert from 'node:assert/strict';

const baseUrl = process.argv[2] || 'http://localhost:3000';
for (const [name, cookie, body] of [
  ['guest', '', JSON.stringify({ query: 'сытный обед' })],
  ['forged session', `belok_session=00000000-0000-4000-8000-000000000000.${'0'.repeat(64)}`, JSON.stringify({ query: 'сытный обед' })],
  ['guest with malformed input', '', '{'],
]) {
  const response = await fetch(new URL('/api/products/search', baseUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body, signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 401, name);
  assert.equal(response.headers.get('cache-control'), 'no-store', name);
  const data = await response.json();
  assert.equal(data.code, 'AUTH_REQUIRED', name);
  assert.equal(data.matches, undefined, name);
  console.log(`${name}: access denied before menu selection`);
}
const catalog = await fetch(new URL('/api/products', baseUrl), { signal: AbortSignal.timeout(15000) });
assert.equal(catalog.status, 200, 'public menu remains available');
assert.ok(Array.isArray((await catalog.json()).products));
console.log('public menu: available without login');
