import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';

const base = process.env.TOPPINGS_TEST_URL ?? 'http://localhost:3104';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname), 'Tests only run against the local sandbox');
const id = 'toppings-local-session';
const cookie = `belok_session=${id}.${createHmac('sha256', process.env.SESSION_SECRET ?? 'toppings-local-check-only').update(id).digest('hex')}`;
const productId = 'toppings-local-syrniki';
const original = ['toppings-local-sourcream','toppings-local-jam','toppings-local-honey','toppings-local-stopped'];
const request = async (path, method = 'GET', body, authenticated = true) => {
  const response = await fetch(base + path, { method, headers: { 'Content-Type':'application/json', ...(authenticated ? { cookie } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}) });
  return { status:response.status, data:await response.json() };
};
const update = (body, authenticated) => request('/api/admin/products/' + productId, 'PUT', body, authenticated);
let createdId;
try {
  assert.equal((await update({ toppingIds: [] }, false)).status, 403);
  assert.equal((await update({ toppingIds: original.slice(0,2) })).status, 200);
  let product = (await request('/api/products/' + productId)).data.product;
  assert.deepEqual(product.toppings.map((topping) => topping.id), original.slice(0,2));
  for (const toppingIds of [[productId], ['missing'], ['toppings-local-porridge'], [original[0],original[0]], null, 'invalid']) {
    const result = await update({ toppingIds, name:'Must roll back' });
    assert.equal(result.status, 400, JSON.stringify(result));
    product = (await request('/api/products/' + productId)).data.product;
    assert.equal(product.name, 'Сырники');
    assert.deepEqual(product.toppings.map((topping) => topping.id), original.slice(0,2));
  }
  const created = await request('/api/admin/products', 'POST', { name:'Тест связей топпингов', price:100, categoryId:'toppings-local-breakfast', toppingIds:[original[0]] });
  assert.equal(created.status, 201, JSON.stringify(created));
  createdId = created.data.product.id;
  assert.equal(created.data.product.toppings[0].id, original[0]);
  assert.equal((await update({ toppingIds: [] })).status, 200);
  assert.equal((await request('/api/products/' + productId)).data.product.toppings.length, 0);
  assert.equal((await update({ toppingIds: original })).status, 200);
  product = (await request('/api/products/' + productId)).data.product;
  assert.equal(product.toppings.find((topping) => topping.id === original[3]).isAvailable, false);
  const items = [{ productId, quantity:2 }, { productId:original[0], quantity:2 }, { productId:original[1], quantity:2 }];
  for (const path of ['/api/orders','/api/kiosk/orders']) {
    const order = await request(path, 'POST', { items, paymentMethod:'CASH', fulfillment:'PICKUP', pickupTime:'ASAP', requestId:randomUUID() });
    assert.ok([200,201].includes(order.status), JSON.stringify(order));
    assert.equal(order.data.order.total, 760);
    assert.equal(order.data.order.items.length, 3);
    assert.equal(order.data.order.items.find((item) => item.productId === original[0]).quantity, 2);
    const stopped = await request(path, 'POST', { items:[{ productId:original[3], quantity:1 }], paymentMethod:'CASH', fulfillment:'PICKUP', pickupTime:'ASAP' });
    assert.equal(stopped.status, 400, JSON.stringify(stopped));
  }
  console.log('PASS: authenticated admin create/edit/remove toppings, rollback on invalid links, public catalog availability, real menu and kiosk cash orders with toppings and server pricing');
} finally {
  await update({ toppingIds:original });
  if (createdId) await request('/api/admin/products/' + createdId, 'DELETE');
}
