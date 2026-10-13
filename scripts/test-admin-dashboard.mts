import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cafeDay,
  dashboardPeriod,
  fetchAdminJson,
  orderMetrics,
  weeklyMetrics,
  type DashboardOrder,
} from "../src/lib/adminDashboard";

const order = (overrides: Partial<DashboardOrder>): DashboardOrder => ({
  id: "test",
  status: "PENDING",
  total: 500,
  paymentStatus: "PENDING",
  createdAt: "2026-10-08T23:00:00Z",
  comment: null,
  user: null,
  items: [],
  ...overrides,
});

test('cash and noncash sums and settled amounts are separated; bonuses remain explicit', () => {
  const metrics = orderMetrics([
    order({ total: 500, paymentMethod: 'CASH', paymentStatus: 'SUCCEEDED' }),
    order({ total: 200, paymentMethod: 'CARD', paymentStatus: 'SUCCEEDED' }),
    order({ total: 150, paymentMethod: 'SBP', paymentStatus: 'PENDING' }),
    order({ total: 100, paymentMethod: 'BONUS', paymentStatus: 'SUCCEEDED' }),
    order({ total: 999, paymentMethod: 'CASH', status: 'CANCELLED' }),
  ]);
  assert.deepEqual(metrics.amounts, { cash: 500, nonCash: 350, other: 100 });
  assert.deepEqual(metrics.paidAmounts, { cash: 500, nonCash: 200, other: 100 });
});

test("cafe day changes at Kaliningrad midnight, regardless of the timestamp offset", () => {
  assert.equal(cafeDay("2026-10-08T21:59:59Z"), "2026-10-08");
  assert.equal(cafeDay("2026-10-08T22:00:00Z"), "2026-10-09");
  assert.equal(cafeDay("2026-10-09T01:00:00+03:00"), "2026-10-09");
});

test("periods include today and cross month/year boundaries without dropping days", () => {
  assert.deepEqual(dashboardPeriod(1, new Date("2026-12-31T22:30:00Z")), [
    "2027-01-01",
  ]);
  assert.deepEqual(dashboardPeriod(3, new Date("2026-12-31T22:30:00Z")), [
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
  ]);
  assert.equal(
    dashboardPeriod(30, new Date("2026-10-09T08:00:00Z")).length,
    30,
  );
});

test("cancelled orders never inflate totals, paid amounts or the average", () => {
  assert.deepEqual(
    orderMetrics([
      order({ total: 500, paymentStatus: "SUCCEEDED" }),
      order({ total: 700 }),
      order({ total: 900, status: "CANCELLED", paymentStatus: "SUCCEEDED" }),
    ]),
    { count: 3, total: 1200, average: 600, paid: 500, amounts: { cash: 0, nonCash: 0, other: 1200 }, paidAmounts: { cash: 0, nonCash: 0, other: 500 } },
  );
});

test("an empty or entirely cancelled period has no NaN or fabricated revenue", () => {
  assert.deepEqual(orderMetrics([]), {
    count: 0,
    total: 0,
    average: 0,
    paid: 0,
    amounts: { cash: 0, nonCash: 0, other: 0 },
    paidAmounts: { cash: 0, nonCash: 0, other: 0 },
  });
  assert.deepEqual(orderMetrics([order({ status: "CANCELLED" })]), {
    count: 1,
    total: 0,
    average: 0,
    paid: 0,
    amounts: { cash: 0, nonCash: 0, other: 0 },
    paidAmounts: { cash: 0, nonCash: 0, other: 0 },
  });
});

test("HTTP errors reject the query rather than looking like an empty successful response", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Нет доступа" }), { status: 403 });
    await assert.rejects(
      fetchAdminJson("/api/admin/orders"),
      /Не удалось загрузить/,
    );
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ orders: [] }), { status: 200 });
    assert.deepEqual(await fetchAdminJson("/api/admin/orders"), { orders: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("weekly revenue separates cash, card/SBP and unknown methods without counting unpaid or cancelled orders", () => {
  const week = weeklyMetrics([
    order({ total: 200, paymentMethod: "CASH", paymentStatus: "SUCCEEDED" }),
    order({ total: 300, paymentMethod: "CARD", paymentStatus: "SUCCEEDED" }),
    order({ total: 150, paymentMethod: "SBP", paymentStatus: "SUCCEEDED" }),
    order({ total: 75, paymentMethod: null, paymentStatus: "SUCCEEDED" }),
    order({ total: 25, paymentMethod: "LEGACY", paymentStatus: "SUCCEEDED" }),
    order({ total: 900, paymentMethod: "CASH", paymentStatus: "SUCCEEDED", status: "CANCELLED" }),
    order({ total: 800, paymentMethod: "SBP" }),
    order({ total: 700, paymentMethod: "CARD", paymentStatus: "CANCELLED" }),
    order({ total: 0, paymentMethod: "BONUS", paymentStatus: "SUCCEEDED" }),
    order({ total: 600, paymentMethod: "BONUS", paymentStatus: "SUCCEEDED" }),
  ], new Date("2026-10-09T08:00:00Z"));
  assert.deepEqual(week[6], {
    day: "2026-10-09", count: 10, revenue: 750, cash: 200, cashless: 450, unknown: 100,
  });
  for (const day of week) assert.equal(day.revenue, day.cash + day.cashless + day.unknown);
});

test("weekly buckets use Kaliningrad dates, retain empty days and exclude orders outside the week", () => {
  const now = new Date("2026-10-09T08:00:00Z");
  const week = weeklyMetrics([
    order({ createdAt: "2026-10-08T21:59:59Z", total: 100, paymentMethod: "CASH", paymentStatus: "SUCCEEDED" }),
    order({ createdAt: "2026-10-08T22:00:00Z", total: 200, paymentMethod: "SBP", paymentStatus: "SUCCEEDED" }),
    order({ createdAt: "2026-10-02T21:59:59Z", paymentStatus: "SUCCEEDED" }),
    order({ createdAt: "2026-10-09T22:00:00Z", paymentStatus: "SUCCEEDED" }),
  ], now);
  assert.equal(week.length, 7);
  assert.equal(week[0].day, "2026-10-03");
  assert.equal(week[0].count, 0);
  assert.equal(week[5].cash, 100);
  assert.equal(week[6].cashless, 200);
  assert.equal(week.reduce((sum, day) => sum + day.count, 0), 2);
  assert.ok(weeklyMetrics([], now).every((day) => day.count === 0 && day.revenue === 0));
});
