import type { OrderItemView } from "@/components/admin/OrderItemsList";

export interface DashboardOrder {
  id: string;
  status: string;
  total: number;
  paymentStatus: string;
  createdAt: string;
  comment: string | null;
  user: {
    phone: string | null;
    email: string | null;
    name: string | null;
  } | null;
  guestEmail?: string | null;
  dailyNumber?: number | null;
  fulfillment?: string | null;
  items: OrderItemView[];
}

export const CAFE_TIME_ZONE = "Europe/Kaliningrad";
export const ACTIVE_ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
];
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAFE_TIME_ZONE,
});
export const cafeDay = (date: Date | string) =>
  dayFormatter.format(new Date(date));

export function dashboardPeriod(days: number, now = new Date()) {
  // Calendar arithmetic in UTC avoids the browser's timezone and DST boundaries.
  const end = new Date(`${cafeDay(now)}T12:00:00Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - days + index + 1);
    return date.toISOString().slice(0, 10);
  });
}

export function orderMetrics(orders: DashboardOrder[]) {
  const valid = orders.filter((order) => order.status !== "CANCELLED");
  const total = valid.reduce((sum, order) => sum + Number(order.total), 0);
  return {
    count: orders.length,
    total,
    average: valid.length ? total / valid.length : 0,
    paid: valid
      .filter((order) => order.paymentStatus === "SUCCEEDED")
      .reduce((sum, order) => sum + Number(order.total), 0),
  };
}

export async function fetchAdminJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error("Не удалось загрузить данные. Попробуйте ещё раз.");
  return response.json() as Promise<T>;
}
export const fetchAdminOrders = () =>
  fetchAdminJson<{ orders: DashboardOrder[] }>("/api/admin/orders");
