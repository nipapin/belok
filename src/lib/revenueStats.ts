import { cafeDay, CAFE_TIME_ZONE, orderMetrics, type DashboardOrder } from './adminDashboard';

export function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function revenueDays(from: string, to: string): string[] {
  if (!validDay(from) || !validDay(to) || from > to) return [];
  const dates: string[] = [];
  const date = new Date(`${from}T12:00:00Z`);
  for (; date.toISOString().slice(0, 10) <= to; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: CAFE_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' });
export function revenueStats(orders: DashboardOrder[], from: string, to: string) {
  const days = revenueDays(from, to);
  const selected = new Set(days);
  const periodOrders = orders.filter(order => selected.has(cafeDay(order.createdAt)));
  const summarize = (list: DashboardOrder[]) => {
    const writeOffs = list.filter(order => order.isWriteOff && order.status !== 'CANCELLED');
    return {
      ...orderMetrics(list),
      paymentCounts: {
        cash: list.filter(order => order.paymentMethod === 'CASH').length,
        nonCash: list.filter(order => ['CARD', 'SBP'].includes(order.paymentMethod ?? '')).length,
        other: list.filter(order => !['CASH', 'CARD', 'SBP'].includes(order.paymentMethod ?? '')).length,
      },
      writeOffCount: writeOffs.length,
      writeOffTotal: writeOffs.reduce((sum, order) => sum + Number(order.total), 0),
    };
  };
  const byDay = new Map<string, DashboardOrder[]>();
  for (const order of periodOrders) {
    const day = cafeDay(order.createdAt);
    const bucket = byDay.get(day) ?? [];
    bucket.push(order);
    byDay.set(day, bucket);
  }
  const hourly = Array.from({ length: 13 }, (_, index) => ({
    hour: index + 8, count: 0, writeOffs: 0, paid: 0,
    paidAmounts: { cash: 0, nonCash: 0, other: 0 },
  }));
  let outsideHours = 0;
  let outsideHoursPaid = 0;
  for (const order of periodOrders) {
    if (order.status === 'CANCELLED') continue;
    const hour = Number(hourFormatter.format(new Date(order.createdAt)));
    const bucket = hourly.find(bucket => bucket.hour === hour);
    if (!bucket) {
      outsideHours++;
      if (!order.isWriteOff && order.paymentStatus === 'SUCCEEDED') outsideHoursPaid += Number(order.total);
      continue;
    }
    bucket.count++;
    if (order.isWriteOff) bucket.writeOffs++;
    else if (order.paymentStatus === 'SUCCEEDED') {
      const amount = Number(order.total);
      bucket.paid += amount;
      const method = order.paymentMethod === 'CASH' ? 'cash'
        : ['CARD', 'SBP'].includes(order.paymentMethod ?? '') ? 'nonCash' : 'other';
      bucket.paidAmounts[method] += amount;
    }
  }
  return {
    orders: periodOrders,
    summary: summarize(periodOrders),
    daily: days.map(day => ({ day, ...summarize(byDay.get(day) ?? []) })),
    hourly,
    outsideHours,
    outsideHoursPaid,
  };
}
