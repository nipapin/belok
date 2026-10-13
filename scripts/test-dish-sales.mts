import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dishSalesStats } from '../src/lib/dishSalesStats';
import type { DashboardOrder } from '../src/lib/adminDashboard';
import type { OrderItemView } from '../src/components/admin/OrderItemsList';
import { canAccessPage } from '../src/lib/roles';

const item = (quantity: number, overrides: Partial<OrderItemView> = {}): OrderItemView => ({ productId: 'soup', product: { name: 'Суп' }, quantity, unitPrice: 250, customizations: [], ...overrides });
const order = (overrides: Partial<DashboardOrder> = {}): DashboardOrder => ({ id: 'test', createdAt: '2026-10-13T06:00:00Z', status: 'COMPLETED', paymentStatus: 'SUCCEEDED', total: 500, user: null, comment: null, items: [item(2)], ...overrides });

test('sums quantities across lines, orders and variants; counts each order once per dish', () => {
  const stats = dishSalesStats([
    order({ items: [item(2), item(3, { variantName: 'Большой' }), item(4, { productId: 'salad', product: { name: 'Салат' } })] }),
    order({ id: 'second', items: [item(1)] }),
  ], '2026-10-13', '2026-10-13');
  assert.equal(stats.quantity, 10);
  assert.equal(stats.orderCount, 2);
  assert.equal(stats.dishCount, 2);
  assert.deepEqual(stats.dishes.map(row => [row.name, row.quantity, row.orderCount]), [['Суп', 6, 2], ['Салат', 4, 1]]);
});

test('excludes cancelled/unpaid orders and separates employee writeoffs', () => {
  const stats = dishSalesStats([
    order(), order({ paymentStatus: 'PENDING' }), order({ status: 'CANCELLED' }),
    order({ isWriteOff: true, paymentStatus: 'PENDING', items: [item(5)] }),
    order({ isWriteOff: true, status: 'CANCELLED' }),
  ], '2026-10-13', '2026-10-13');
  assert.equal(stats.quantity, 2);
  assert.equal(stats.writeOffQuantity, 5);
  assert.equal(stats.orderCount, 1);
  assert.equal(stats.dishes[0].writeOffQuantity, 5);
});

test('uses inclusive Kaliningrad dates regardless of browser timezone and validates periods', () => {
  const orders = [
    order({ createdAt: '2026-10-12T21:59:59Z' }),
    order({ createdAt: '2026-10-12T22:00:00Z' }),
    order({ createdAt: '2026-10-13T21:59:59Z' }),
    order({ createdAt: '2026-10-13T22:00:00Z' }),
  ];
  assert.equal(dishSalesStats(orders, '2026-10-13', '2026-10-13').quantity, 4);
  assert.equal(dishSalesStats(orders, '2026-10-13', '2026-10-14').quantity, 6);
  assert.equal(dishSalesStats(orders, '2026-10-14', '2026-10-13').quantity, 0);
  assert.equal(dishSalesStats(orders, '2026-02-30', '2026-10-13').quantity, 0);
});

test('keeps different products with identical names and deleted products separate', () => {
  const stats = dishSalesStats([order({ items: [item(2), item(1, { productId: 'another' }), item(3, { productId: 'deleted-a', product: null }), item(4, { productId: 'deleted-b', product: null }), item(0), item(-1), item(NaN)] })], '2026-10-13', '2026-10-13');
  assert.equal(stats.dishCount, 4);
  assert.equal(stats.quantity, 10);
  assert.equal(stats.dishes.length, 4);
});

test('empty periods and writeoff-only dishes keep sold totals zero', () => {
  assert.equal(dishSalesStats([], '2026-10-13', '2026-10-13').quantity, 0);
  const stats = dishSalesStats([order({ isWriteOff: true })], '2026-10-13', '2026-10-13');
  assert.equal(stats.quantity, 0);
  assert.equal(stats.dishCount, 0);
  assert.equal(stats.orderCount, 0);
  assert.equal(stats.writeOffQuantity, 2);
});

test('dish report has the same role access as revenue', () => {
  for (const role of ['ADMIN', 'OWNER', 'MANAGER', 'CASHIER', 'COOK', 'STOCKKEEPER', 'USER']) {
    assert.equal(canAccessPage({ role }, '/admin/dish-sales'), canAccessPage({ role }, '/admin/revenue'));
  }
});
