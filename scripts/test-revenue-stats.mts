import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revenueDays, revenueStats } from '../src/lib/revenueStats';
import { orderMetrics, type DashboardOrder } from '../src/lib/adminDashboard';

const order = (overrides: Partial<DashboardOrder>): DashboardOrder => ({ id: 'test', createdAt: '2026-10-13T06:00:00Z', total: 500, status: 'COMPLETED', paymentStatus: 'SUCCEEDED', paymentMethod: 'CASH', user: null, comment: null, items: [], ...overrides });

test('inclusive calendar ranges contain empty days and reject impossible dates', () => {
  assert.deepEqual(revenueDays('2026-12-31', '2027-01-02'), ['2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual(revenueDays('2026-02-30', '2026-03-02'), []);
  assert.deepEqual(revenueDays('2026-10-14', '2026-10-13'), []);
});
test('paid revenue excludes employees, cancellation and pending payment; daily sums equal period', () => {
  const stats = revenueStats([
    order({}), order({ total: 200, paymentMethod: 'CARD' }),
    order({ total: 100, paymentMethod: 'SBP' }),
    order({ total: 800, isWriteOff: true }),
    order({ total: 300, paymentStatus: 'PENDING' }),
    order({ total: 999, status: 'CANCELLED' }),
    order({ total: 50, createdAt: '2026-10-13T22:00:00Z' }),
    order({ total: 9999, createdAt: '2026-10-12T21:59:59Z' }),
  ], '2026-10-13', '2026-10-15');
  assert.equal(stats.summary.paid, 850);
  assert.deepEqual(stats.summary.paidAmounts, { cash: 550, nonCash: 300, other: 0 });
  assert.equal(stats.summary.writeOffTotal, 800);
  assert.equal(stats.summary.writeOffCount, 1);
  assert.equal(stats.daily[2].count, 0);
  assert.equal(stats.daily.reduce((sum, day) => sum + day.paid, 0), stats.summary.paid);
  assert.equal(stats.summary.count, 7);
  assert.equal(orderMetrics([order({ isWriteOff: true })]).average, 0);
});
test('working hours are 08:00 inclusive to 21:00 exclusive in cafe timezone', () => {
  const stats = revenueStats([
    order({ createdAt: '2026-10-13T05:59:59Z' }),
    order({ createdAt: '2026-10-13T06:00:00Z' }),
    order({ createdAt: '2026-10-13T18:59:59Z' }),
    order({ createdAt: '2026-10-13T19:00:00Z' }),
    order({ isWriteOff: true }), order({ status: 'CANCELLED' }),
  ], '2026-10-13', '2026-10-13');
  assert.equal(stats.hourly.length, 13);
  assert.equal(stats.hourly[0].count, 2);
  assert.equal(stats.hourly[0].writeOffs, 1);
  assert.equal(stats.hourly[0].paid, 500);
  assert.equal(stats.hourly[12].count, 1);
  assert.equal(stats.outsideHours, 2);
  assert.equal(stats.outsideHoursPaid, 1000);
});

test('hourly revenue separates settled cash, card/SBP and other payments and reconciles with period totals', () => {
  const stats = revenueStats([
    order({ total: 500 }),
    order({ total: 200, paymentMethod: 'CARD' }),
    order({ total: 150, paymentMethod: 'SBP' }),
    order({ total: 25, paymentMethod: 'BONUS' }),
    order({ total: 50, paymentMethod: null }),
    order({ total: 800, paymentStatus: 'PENDING', paymentMethod: 'CARD' }),
    order({ total: 900, isWriteOff: true }),
    order({ total: 999, status: 'CANCELLED', paymentMethod: 'SBP' }),
    order({ total: 100, createdAt: '2026-10-14T06:00:00Z', paymentMethod: 'CASH' }),
    order({ total: 300, createdAt: '2026-10-13T19:00:00Z', paymentMethod: 'CARD' }),
    order({ total: 777, createdAt: '2026-10-13T19:00:00Z', isWriteOff: true }),
    order({ total: 888, createdAt: '2026-10-13T19:00:00Z', paymentStatus: 'PENDING' }),
    order({ total: 9999, createdAt: '2026-10-12T06:00:00Z' }),
  ], '2026-10-13', '2026-10-14');
  assert.equal(stats.hourly[0].count, 8);
  assert.equal(stats.hourly[0].writeOffs, 1);
  assert.equal(stats.hourly[0].paid, 1025);
  assert.deepEqual(stats.hourly[0].paidAmounts, { cash: 600, nonCash: 350, other: 75 });
  assert.equal(stats.outsideHoursPaid, 300);
  assert.equal(stats.hourly.reduce((sum, row) => sum + row.paid, 0) + stats.outsideHoursPaid, stats.summary.paid);
  for (const row of stats.hourly) {
    assert.equal(row.paid, Object.values(row.paidAmounts).reduce((sum, amount) => sum + amount, 0));
  }
  assert.ok(revenueStats([], '2026-10-13', '2026-10-13').hourly.every(row => row.paid === 0 && row.paidAmounts.cash === 0 && row.paidAmounts.nonCash === 0 && row.paidAmounts.other === 0));
});

test('daily payment counts cover all orders while revenue only includes paid sales', () => {
  const stats = revenueStats([
    order({}), order({ paymentMethod: 'CARD', total: 200 }),
    order({ paymentMethod: 'SBP', paymentStatus: 'PENDING' }),
    order({ paymentMethod: 'CASH', isWriteOff: true }),
    order({ paymentMethod: 'CARD', status: 'CANCELLED' }),
    order({ paymentMethod: 'BONUS', total: 25 }),
    order({ paymentMethod: null, createdAt: '2026-10-14T06:00:00Z' }),
  ], '2026-10-13', '2026-10-15');
  assert.deepEqual(stats.summary.paymentCounts, { cash: 2, nonCash: 3, other: 2 });
  assert.deepEqual(stats.daily[0].paymentCounts, { cash: 2, nonCash: 3, other: 1 });
  assert.deepEqual(stats.daily[2].paymentCounts, { cash: 0, nonCash: 0, other: 0 });
  assert.equal(stats.daily[0].paid, 725);
  for (const day of stats.daily) {
    assert.equal(Object.values(day.paymentCounts).reduce((a, b) => a + b, 0), day.count);
  }
  for (const key of ['cash', 'nonCash', 'other'] as const) {
    assert.equal(stats.daily.reduce((sum, day) => sum + day.paymentCounts[key], 0), stats.summary.paymentCounts[key]);
  }
});
