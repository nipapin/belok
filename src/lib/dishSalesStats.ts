import { cafeDay, type DashboardOrder } from './adminDashboard';
import { validDay } from './revenueStats';

export function dishSalesStats(orders: DashboardOrder[], from: string, to: string) {
  const dishes = new Map<string, { id: string; name: string; quantity: number; writeOffQuantity: number; orderCount: number }>();
  let orderCount = 0;
  if (validDay(from) && validDay(to) && from <= to) for (const order of orders) {
    const day = cafeDay(order.createdAt);
    if (day < from || day > to || order.status === 'CANCELLED') continue;
    if (!order.isWriteOff && order.paymentStatus !== 'SUCCEEDED') continue;
    const seen = new Set<string>();
    for (const item of order.items) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const name = item.product?.name ?? 'Удалённый товар';
      // Product identity survives renames/deletion; variants and extras belong to the same dish.
      const id = item.productId ? `product:${item.productId}` : `name:${name}`;
      const row = dishes.get(id) ?? { id, name, quantity: 0, writeOffQuantity: 0, orderCount: 0 };
      if (order.isWriteOff) row.writeOffQuantity += quantity;
      else {
        row.quantity += quantity;
        if (!seen.has(id)) row.orderCount++;
      }
      dishes.set(id, row);
      seen.add(id);
    }
    if (!order.isWriteOff && seen.size) orderCount++;
  }
  const rows = [...dishes.values()].sort((a, b) => b.quantity - a.quantity || b.writeOffQuantity - a.writeOffQuantity || a.name.localeCompare(b.name, 'ru'));
  return {
    dishes: rows,
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    writeOffQuantity: rows.reduce((sum, row) => sum + row.writeOffQuantity, 0),
    dishCount: rows.filter(row => row.quantity > 0).length,
    orderCount,
  };
}
