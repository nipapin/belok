import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cafeDay,
  dashboardPeriod,
  fetchAdminJson,
  orderMetrics,
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
    { count: 3, total: 1200, average: 600, paid: 500 },
  );
});

test("an empty or entirely cancelled period has no NaN or fabricated revenue", () => {
  assert.deepEqual(orderMetrics([]), {
    count: 0,
    total: 0,
    average: 0,
    paid: 0,
  });
  assert.deepEqual(orderMetrics([order({ status: "CANCELLED" })]), {
    count: 1,
    total: 0,
    average: 0,
    paid: 0,
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
