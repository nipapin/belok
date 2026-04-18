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

interface Order {
  id: string;
  status: string;
  total: number;
  bonusUsed: number;
  discountAmount: number;
  paymentStatus: string;
  createdAt: string;
  user: { phone: string; name: string | null };
  items: { product: { name: string }; quantity: number; unitPrice: number }[];
}

export default function AdminOrdersPage() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => fetch('/api/admin/orders').then((r) => r.json()),
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

      <div className="admin-table-wrap overflow-x-auto">
        <table className="admin-table min-w-[900px]">
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
                <td>{order.user?.name || order.user?.phone}</td>
                <td>
                  {order.items.map((item, i) => (
                    <span key={i} className="block text-xs text-(--lg-text-muted)">
                      {item.product.name} ×{item.quantity}
                    </span>
                  ))}
                </td>
                <td>
                  <span className="font-semibold">{order.total} ₽</span>
                  {order.bonusUsed > 0 && (
                    <span className="mt-0.5 block text-xs text-amber-700">Бонусы: −{order.bonusUsed} ₽</span>
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
                    className="input-pill max-w-[160px] cursor-pointer py-2 text-xs font-medium"
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
  );
}
