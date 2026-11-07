import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateAdminOrderStatus } from '../src/lib/adminOrderStatus';

test('status mutation preserves API errors instead of reporting success', async (t) => {
  for (const [status, error] of [
    [403, 'Недопустимый переход статуса'],
    [409, 'Дождитесь подтверждения оплаты или отмены от aQsi'],
  ] as const) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error }, { status }));
    await assert.rejects(updateAdminOrderStatus('order-1', 'READY'), { message: error });
    t.mock.restoreAll();
  }
});

test('proxy errors and malformed success responses cannot look like a saved status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Bad Gateway</html>', { status: 502 }));
  await assert.rejects(updateAdminOrderStatus('order-1', 'READY'), /Не удалось изменить статус/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  await assert.rejects(updateAdminOrderStatus('order-1', 'READY'), /Сервер не подтвердил/);
});

test('successful mutation sends selected status and returns server-confirmed order', async (t) => {
  const order = { id: 'order-1', status: 'READY' };
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/admin/orders/order-1');
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body as string), { status: 'READY' });
    return Response.json({ order });
  });
  assert.deepEqual(await updateAdminOrderStatus('order-1', 'READY'), { order });
});

test('accepted terminal cancellation preserves pending notice without pretending the order is cancelled', async (t) => {
  const data={order:{id:'order-1',status:'PENDING'},notice:'Ожидаем подтверждения aQsi'};
  t.mock.method(globalThis,'fetch',async()=>Response.json(data,{status:202}));
  assert.deepEqual(await updateAdminOrderStatus('order-1','CANCELLED'),data);
});
