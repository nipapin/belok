import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';

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
let quickCreatedId;
const testOrderIds = [];
try {
  assert.equal((await request('/api/admin/products/toppings', 'POST', { name:'Карамель',price:45 }, false)).status,403);
  for (const draft of [{name:'',price:40},{name:'Мёд',price:-5},{name:'Мёд',price:'10abc'}]) assert.equal((await request('/api/admin/products/toppings', 'POST', draft)).status,400);
  const quick = await request('/api/admin/products/toppings', 'POST', {name:'Тестовая карамель',price:'45,50'});
  assert.equal(quick.status,201,JSON.stringify(quick));
  quickCreatedId = quick.data.product.id;
  assert.equal(quick.data.product.category.name,'Топпинги');
  assert.equal(quick.data.product.price,45.5);
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
  const created = await request('/api/admin/products', 'POST', { name:'Тест связей топпингов', price:100, categoryId:'toppings-local-breakfast', toppingIds:[original[0]],variants:[{name:'Рисовая'},{name:'Овсяная'}] });
  assert.equal(created.status, 201, JSON.stringify(created));
  createdId = created.data.product.id;
  assert.equal(created.data.product.toppings[0].id, original[0]);
  assert.equal((await update({ toppingIds: [] })).status, 200);
  assert.equal((await request('/api/products/' + productId)).data.product.toppings.length, 0);
  assert.equal((await update({ toppingIds: original })).status, 200);
  product = (await request('/api/products/' + productId)).data.product;
  assert.equal(product.toppings.find((topping) => topping.id === original[3]).isAvailable, false);
  const items = [{ productId, quantity:2, toppings:[{productId:original[0]},{productId:original[1]}] }];
  for (const path of ['/api/orders','/api/kiosk/orders']) {
    const order = await request(path, 'POST', { items, paymentMethod:'CASH', fulfillment:'PICKUP', pickupTime:'ASAP', requestId:randomUUID() });
    assert.ok([200,201].includes(order.status), JSON.stringify(order));
    testOrderIds.push(order.data.order.id);
    assert.equal(order.data.order.total, 760);
    assert.equal(order.data.order.items.length, 3);
    assert.equal(order.data.order.items.find((item) => item.productId === original[0]).quantity, 2);
    const root = order.data.order.items.find((item) => !item.parentItemId);
    assert.ok(order.data.order.items.filter((item) => item.parentItemId).every((item) => item.parentItemId === root.id));
    for (const toppings of [[{productId:original[3]}],[{productId:'toppings-local-porridge'}],[{productId:original[0]},{productId:original[0]}],[{productId:original[0],variantId:'foreign'}]]) {
      const invalid = await request(path,'POST',{items:[{productId,quantity:1,toppings}],paymentMethod:'CASH',fulfillment:'PICKUP',pickupTime:'ASAP'});
      assert.equal(invalid.status,400,JSON.stringify(invalid));
    }
    const stopped = await request(path, 'POST', { items:[{ productId:original[3], quantity:1 }], paymentMethod:'CASH', fulfillment:'PICKUP', pickupTime:'ASAP' });
    assert.equal(stopped.status, 400, JSON.stringify(stopped));
    const variants = created.data.product.variants;
    const variantOrder = await request(path,'POST',{items:[{productId:createdId,variantId:variants[0].id,quantity:1},{productId:createdId,variantId:variants[1].id,quantity:1,toppings:[{productId:original[0],basePrice:0}]}],paymentMethod:'CASH',fulfillment:'PICKUP',pickupTime:'ASAP'});
    assert.ok([200,201].includes(variantOrder.status),JSON.stringify(variantOrder));
    testOrderIds.push(variantOrder.data.order.id);
    assert.equal(variantOrder.data.order.total,240);
    const linked = variantOrder.data.order.items.find((item) => item.parentItemId);
    assert.equal(variantOrder.data.order.items.find((item) => item.id === linked.parentItemId).variantId,variants[1].id);
    const orderId = variantOrder.data.order.id;
    assert.equal((await request(`/api/order-board/${orderId}/status`,'PATCH',{status:'PREPARING'})).status,200);
    const board = (await request('/api/order-board')).data.orders.find((entry) => entry.id === orderId);
    assert.equal(board.items.length,2);
    assert.ok(board.items.find((item) => item.name.includes('Овсяная')).customizations.some((choice) => choice.name === 'Сметана'));
    assert.equal(board.items.find((item) => item.name.includes('Рисовая')).customizations.length,0);
    for (const [index,item] of board.items.entries()) {
      const mark = await request(`/api/order-board/${orderId}/items/${item.id}`,'PATCH',{action:'prepare',preparedQuantity:0});
      assert.equal(mark.status,200,JSON.stringify(mark));
      assert.equal(mark.data.order.status,index === 1 ? 'READY' : 'PREPARING');
    }
  }
  console.log('PASS: authenticated admin create/edit/remove toppings, rollback on invalid links, public catalog availability, real menu and kiosk cash orders with toppings and server pricing');
} finally {
  await update({ toppingIds:original });
  if (testOrderIds.length) {
    const sandbox = new URL(process.env.TOPPINGS_LOCAL_ADMIN_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres');
    assert.ok(['127.0.0.1','localhost'].includes(sandbox.hostname));
    sandbox.pathname = '/belok_toppings_local';
    const client = new pg.Client({connectionString:sandbox.href});
    await client.connect();
    try { await client.query('DELETE FROM orders WHERE id=ANY($1::text[])',[testOrderIds]); } finally { await client.end(); }
  }
  if (createdId) await request('/api/admin/products/' + createdId, 'DELETE');
  if (quickCreatedId) await request('/api/admin/products/' + quickCreatedId, 'DELETE');
}
