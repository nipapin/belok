import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMenuSearch, validateSelections, menuSearchQuery } from '../src/lib/menuSearch.server';
import type { ProductWithRelations } from '../src/lib/types';

const lunch = {
  id: 'lunch', name: 'Ланч с говядиной', description: 'Говядина и гречка', price: 650,
  isAvailable: true, category: { name: 'Обеды', isActive: true },
  calories: null, proteins: null, ingredients: [], variants: [],
} as unknown as ProductWithRelations;
const coffee = {
  ...lunch, id: 'coffee', name: 'Кофе', price: 200,
  variants: [{ id: 'large', name: '400 мл', price: 300 }],
} as ProductWithRelations;
const menu = [lunch, coffee, { ...lunch, id: 'hidden', isAvailable: false },
  { ...lunch, id: 'inactive', category: { ...lunch.category, isActive: false } }];
const config = { baseUrl: 'http://localhost:18765', apiKey: 'test-gateway-token', model: 'test-model' };
const answer = (matches: unknown, stop_reason = 'end_turn') => Response.json({
  stop_reason, content: [{ type: 'text', text: JSON.stringify({ matches }) }],
});
const selected = [{ productId: 'lunch', variantId: null }, { productId: 'coffee', variantId: 'large' }];

test('only available products and their own variants survive model output; duplicates cannot inflate results', () => {
  assert.deepEqual(validateSelections({ matches: [
    ...selected, { productId: 'lunch', variantId: null }, { productId: 'foreign', variantId: null },
    { productId: 'hidden', variantId: null }, { productId: 'inactive', variantId: null },
  ] }, menu), selected);
  assert.deepEqual(validateSelections({ matches: [{ productId: 'lunch', variantId: 'large' }] }, menu), []);
  assert.throws(() => validateSelections({ matches: [{ productId: 'lunch', variantId: null, price: 1 }] }, menu));
  assert.throws(() => validateSelections({ matches: Array.from({ length: 13 }, () => selected[0]) }, menu));
});

test('prompt contains current menu and known facts only, with credentials confined to server headers', async () => {
  const search = createMenuSearch(async (url, options) => {
    assert.equal(url, 'http://localhost:18765/v1/messages');
    assert.equal(new Headers(options?.headers).get('x-api-key'), config.apiKey);
    const body = JSON.parse(String(options?.body));
    assert.equal(String(options?.body).includes(config.apiKey), false);
    const data = JSON.parse(body.messages[0].content);
    assert.deepEqual(data.menu.map((p: { id: string }) => p.id), ['lunch', 'coffee']);
    assert.equal(data.menu[0].calories, null);
    assert.equal(data.menu[1].variants[0].priceRub, 300);
    assert.equal(body.max_tokens, 2048);
    assert.deepEqual(body.output_config, { effort: 'low' });
    return answer(selected);
  });
  assert.deepEqual(await search('Сытный обед', menu, config), selected);
});

test('equivalent requests share a paid call; catalog or model changes invalidate cached ranking', async () => {
  let calls = 0;
  let complete!: (response: Response) => void;
  const search = createMenuSearch(async () => {
    calls++;
    if (calls === 1) return new Promise<Response>((resolve) => { complete = resolve; });
    return answer(selected);
  });
  const first = search('Сытный обед', menu, config);
  const second = search(' сытный   обед ', menu, config);
  assert.equal(calls, 1);
  complete(answer(selected));
  assert.deepEqual(await first, await second);
  await search('сытный обед', menu, config);
  assert.equal(calls, 1);
  await search('сытный обед', [{ ...lunch, price: 700 }, coffee], config);
  assert.equal(calls, 2);
  await search('сытный обед', menu, { ...config, model: 'other-model' });
  assert.equal(calls, 3);
});

test('upstream errors, timeouts and truncated/invalid JSON are not cached and expose no upstream details', async () => {
  for (const fetcher of [
    async () => Response.json({ secret: config.apiKey }, { status: 401 }),
    async () => { throw new Error(`timeout ${config.apiKey}`); },
    async () => answer(selected, 'max_tokens'),
    async () => Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not JSON' }] }),
  ]) {
    let calls = 0;
    const search = createMenuSearch(async () => { calls++; return fetcher(); });
    for (let i = 0; i < 2; i++) await assert.rejects(search('сытный обед', menu, config), { message: 'Menu search unavailable' });
    assert.equal(calls, 2);
  }
});

test('oversized menus fail before billing instead of silently omitting products; queries are bounded', async () => {
  let called = false;
  const search = createMenuSearch(async () => { called = true; return answer(selected); });
  await assert.rejects(search('сытный обед', [{ ...lunch, description: 'я'.repeat(40_000) }], config));
  assert.equal(called, false);
  assert.equal(menuSearchQuery.safeParse('  ').success, false);
  assert.equal(menuSearchQuery.safeParse('я'.repeat(241)).success, false);
});

test('unavailable items are removed even when previously selected and the menu becomes empty', async () => {
  const search = createMenuSearch(async () => answer(selected));
  await search('сытный обед', menu, config);
  assert.deepEqual(await search('сытный обед', menu.map((p) => ({ ...p, isAvailable: false })), config), []);
});
