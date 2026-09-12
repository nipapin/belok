'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const statusLabels: Record<string, { label: string; chip: string }> = {
  PENDING: { label: 'Ожидает', chip: 'admin-chip-neutral' },
  CONFIRMED: { label: 'Подтверждён', chip: 'bg-sky-100 text-sky-800' },
  PREPARING: { label: 'Готовится', chip: 'bg-amber-100 text-amber-900' },
  READY: { label: 'Готов', chip: 'bg-emerald-100 text-emerald-800' },
  COMPLETED: { label: 'Выполнен', chip: 'bg-emerald-100 text-emerald-900' },
  CANCELLED: { label: 'Отменён', chip: 'bg-rose-100 text-rose-800' },
};

interface OrderCustomization {
  action: 'ADD' | 'REMOVE';
  priceDelta: number;
  ingredient: { id: string; name: string; price: number } | null;
}

interface OrderItem {
  product: { name: string } | null;
  quantity: number;
  unitPrice: number;
  customizations: OrderCustomization[];
}

interface Order {
  id: string;
  status: string;
  total: number;
  bonusUsed: number;
  discountAmount: number;
  paymentStatus: string;
  comment: string | null;
  createdAt: string;
  user: { phone: string | null; email: string | null; name: string | null };
  items: OrderItem[];
}

function OrderItemsList({ items }: { items: OrderItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const adds = item.customizations.filter((c) => c.action === 'ADD');
        const removes = item.customizations.filter((c) => c.action === 'REMOVE');
        return (
          <div key={i} className="text-xs leading-relaxed text-(--lg-text-muted)">
            <span className="font-medium text-(--lg-text)">
              {item.product?.name ?? 'Товар'} ×{item.quantity}
            </span>
            <span className="ml-1 tabular-nums">· {item.unitPrice} ₽</span>
            {adds.map((c, j) => (
              <span key={`a-${j}`} className="mt-0.5 block text-emerald-700">
                + {c.ingredient?.name ?? 'добавка'}
                {c.priceDelta > 0 ? ` (+${c.priceDelta} ₽)` : ''}
              </span>
            ))}
            {removes.map((c, j) => (
              <span key={`r-${j}`} className="mt-0.5 block text-rose-700">
                − {c.ingredient?.name ?? 'ингредиент'}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminOrdersPage() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => fetch('/api/admin/orders').then((r) => r.json()),
    refetchInterval: 10_000,
  });
  const orders: Order[] = data?.orders ?? [];

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/admin/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
  });

  return (
    <div>
      <h1 className="heading-section mb-6">Заказы</h1>

      <div className="hidden min-[900px]:block">
        <div className="admin-table-wrap overflow-x-auto">
          <table className="admin-table min-w-[960px]">
            <thead>
              <tr>
                <th>ID</th>
                <th>Клиент</th>
                <th>Состав</th>
                <th>Сумма</th>
                <th>Оплата</th>
                <th>Дата</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="font-mono text-xs">{order.id.slice(0, 8)}</td>
                  <td>{order.user?.name || order.user?.email || order.user?.phone || '—'}</td>
                  <td className="max-w-[280px]">
                    <OrderItemsList items={order.items} />
                    {order.comment ? (
                      <p className="mt-1.5 text-xs italic text-(--lg-text-muted)">
                        Комментарий: {order.comment}
                      </p>
                    ) : null}
                  </td>
                  <td>
                    <span className="font-semibold">{order.total} ₽</span>
                    {order.discountAmount > 0 && (
                      <span className="mt-0.5 block text-xs text-sky-700">
                        Скидка: −{order.discountAmount} ₽
                      </span>
                    )}
                    {order.bonusUsed > 0 && (
                      <span className="mt-0.5 block text-xs text-amber-700">
                        Бонусы: −{order.bonusUsed} ₽
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={
                        order.paymentStatus === 'SUCCEEDED'
                          ? 'inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                          : 'admin-chip-neutral'
                      }
                    >
                      {order.paymentStatus === 'SUCCEEDED' ? 'Оплачен' : order.paymentStatus}
                    </span>
                  </td>
                  <td className="text-xs text-(--lg-text-muted)">
                    {new Date(order.createdAt).toLocaleString('ru-RU')}
                  </td>
                  <td>
                    <select
                      className="select-pill max-w-[160px] py-2 text-xs font-medium"
                      value={order.status}
                      onChange={(e) => updateStatus.mutate({ id: order.id, status: e.target.value })}
                      aria-label="Статус заказа"
                    >
                      {Object.entries(statusLabels).map(([key, val]) => (
                        <option key={key} value={key}>
                          {val.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 min-[900px]:hidden">
        {orders.map((order) => (
          <div key={order.id} className="glass-panel space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-mono text-xs text-(--lg-text-muted)">#{order.id.slice(0, 8)}</p>
              <p className="text-xs text-(--lg-text-muted)">
                {new Date(order.createdAt).toLocaleString('ru-RU')}
              </p>
            </div>
            <p className="text-sm font-medium text-(--lg-text)">
              {order.user?.name || order.user?.email || order.user?.phone || '—'}
            </p>
            <OrderItemsList items={order.items} />
            {order.comment ? (
              <p className="text-xs italic text-(--lg-text-muted)">Комментарий: {order.comment}</p>
            ) : null}
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] pt-3">
              <div>
                <span className="text-lg font-bold tabular-nums text-(--lg-text)">{order.total} ₽</span>
                {order.discountAmount > 0 ? (
                  <span className="mt-0.5 block text-xs text-sky-700">
                    Скидка: −{order.discountAmount} ₽
                  </span>
                ) : null}
                {order.bonusUsed > 0 ? (
                  <span className="mt-0.5 block text-xs text-amber-700">
                    Бонусы: −{order.bonusUsed} ₽
                  </span>
                ) : null}
              </div>
              <span
                className={
                  order.paymentStatus === 'SUCCEEDED'
                    ? 'inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                    : 'admin-chip-neutral'
                }
              >
                {order.paymentStatus === 'SUCCEEDED' ? 'Оплачен' : order.paymentStatus}
              </span>
            </div>
            <label className="block text-xs font-medium text-(--lg-text-muted)">
              Статус
              <select
                className="select-pill mt-1 w-full py-2.5 text-sm font-medium"
                value={order.status}
                onChange={(e) => updateStatus.mutate({ id: order.id, status: e.target.value })}
                aria-label="Статус заказа"
              >
                {Object.entries(statusLabels).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
