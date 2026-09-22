import { query, queryOne } from '@/lib/db';
import { getNotificationSettings } from '@/lib/notificationSettings';
import { absolutePushUrl, getPublicAppOrigin, tryNotifyAdmins } from '@/lib/push';

export function truncatePushText(text: string, max = 180): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildNewOrderPushBody(args: {
  customer: string;
  items: { name: string; quantity: number }[];
  total: number;
}): string {
  const summary = args.items
    .map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name))
    .join(', ');
  return truncatePushText(`${args.customer} · ${summary} · ${args.total} ₽`);
}

export async function notifyKitchenNewOrder(
  orderId: string,
  request?: { headers: Headers; nextUrl: URL }
): Promise<void> {
  const settings = await getNotificationSettings();
  if (!settings.adminNewOrdersPush) return;

  const order = await queryOne<{
    total: number;
    dailyNumber: number | null;
    userName: string | null;
    userPhone: string | null;
    userEmail: string | null;
  }>(
    `SELECT o.total,
            o."dailyNumber" AS "dailyNumber",
            u.name  AS "userName",
            u.phone AS "userPhone",
            u.email AS "userEmail"
       FROM "orders" o
       LEFT JOIN "users" u ON u.id = o."userId"
      WHERE o.id = $1`,
    [orderId]
  );
  if (!order) return;

  const items = await query<{ name: string; quantity: number }>(
    `SELECT p.name, oi.quantity
       FROM "order_items" oi
       JOIN "products" p ON p.id = oi."productId"
      WHERE oi."orderId" = $1
      ORDER BY oi.id ASC`,
    [orderId]
  );

  const customer = order.userName || order.userPhone || order.userEmail || 'Клиент';
  const url = request
    ? absolutePushUrl(`/admin/orders/${orderId}`, request)
    : `${getPublicAppOrigin()}/admin/orders/${orderId}`;

  const ticket = order.dailyNumber != null ? `#${order.dailyNumber}` : null;
  await tryNotifyAdmins({
    title: ticket ? `Заказ ${ticket}` : 'Новый заказ',
    body: buildNewOrderPushBody({ customer, items, total: order.total }),
    url,
    tag: `order-new-${orderId}`,
  });
}
