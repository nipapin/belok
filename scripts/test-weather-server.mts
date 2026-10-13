import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
process.env.SESSION_SECRET = 'weather-unit-test-only';
const { sealWeatherKey, unsealWeatherKey } = await import('../src/lib/weatherSettings.server');
const { requestWeatherDay } = await import('../src/lib/weather.server');

test('credential storage encrypts with unique authenticated IV and rejects tampering', () => {
  const key = 'a'.repeat(32); const encrypted = sealWeatherKey(key);
  assert.equal(unsealWeatherKey(encrypted), key); assert.notEqual(encrypted, sealWeatherKey(key));
  assert.ok(!encrypted.includes(key));
  const parts = encrypted.split('.'); const tag = Buffer.from(parts[1], 'base64'); tag[0] ^= 1; parts[1] = tag.toString('base64');
  assert.throws(() => unsealWeatherKey(parts.join('.')));
});
test('exhausted app budget prevents a provider request; units and opening timestamps are correct', async () => {
  const original = global.fetch; let requests = 0;
  global.fetch = async input => {
    requests++;
    const url = new URL(String(input)); assert.equal(url.searchParams.get('units'), 'metric');
    assert.equal(url.pathname, '/data/4.0/onecall/timeline/1h');
    assert.equal(Number(url.searchParams.get('start')), Date.parse('2026-10-01T06:00:00Z') / 1000);
    const start = Number(url.searchParams.get('start'));
    return Response.json({ data: Array.from({ length: 20 }, (_, index) => ({ dt: start + index * 3600, temp: 10, weather: [{ id: 800 }] })) });
  };
  try {
    const denied = { query: async () => ({ rows: [] }) } as unknown as Pick<PoolClient, 'query'>;
    await assert.rejects(requestWeatherDay('2026-10-01', 'a'.repeat(32), 'archive', denied), /лимит/); assert.equal(requests, 0);
    const allowed = { query: async () => ({ rows: [{ calls: 1 }] }) } as unknown as Pick<PoolClient, 'query'>;
    const rows = await requestWeatherDay('2026-10-01', 'a'.repeat(32), 'archive', allowed);
    assert.equal(rows.length, 13); assert.equal(requests, 1); assert.equal(rows[12].time, '2026-10-01T18:00:00.000Z');
    global.fetch = async () => new Response('', { status: 401 });
    await assert.rejects(requestWeatherDay('2026-10-01', 'a'.repeat(32), 'archive', allowed), error => error instanceof Error && error.message.includes('One Call') && !error.message.includes('a'.repeat(32)));
  } finally { global.fetch = original; }
});
