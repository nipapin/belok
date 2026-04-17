'use client';

import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const statusMap: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Ожидает', className: 'bg-zinc-100 text-zinc-700' },
  CONFIRMED: { label: 'Подтверждён', className: 'bg-sky-100 text-sky-800' },
  PREPARING: { label: 'Готовится', className: 'bg-amber-100 text-amber-900' },
  READY: { label: 'Готов к выдаче', className: 'bg-emerald-100 text-emerald-800' },
  COMPLETED: { label: 'Выполнен', className: 'bg-emerald-100 text-emerald-900' },
  CANCELLED: { label: 'Отменён', className: 'bg-rose-100 text-rose-800' },
};

interface Order {
  id: string;
  status: string;
  total: number;
  bonusEarned: number;
  createdAt: string;
  items: { product: { name: string }; quantity: number }[];
}

export default function OrdersPage() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => fetch('/api/orders').then((r) => r.json()),
  });

  const orders: Order[] = data?.orders ?? [];

  return (
    <div className="mx-auto max-w-md pb-4 pt-2">
      <h1 className="heading-section mb-4">Мои заказы</h1>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-tight h-[100px] animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="glass-panel py-14 text-center">
          <Receipt className="mx-auto mb-3 size-14 text-zinc-300" strokeWidth={1.25} />
          <p className="text-base font-medium text-zinc-600">Заказов пока нет</p>
        </div>
      ) : (
        orders.map((order) => {
          const s = statusMap[order.status] || {
            label: order.status,
            className: 'bg-zinc-100 text-zinc-700',
          };
          return (
            <button
              key={order.id}
              type="button"
              onClick={() => router.push(`/orders/${order.id}`)}
              className="glass-panel mb-3 w-full cursor-pointer p-4 text-left transition hover:bg-white/60"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-900">
                  Заказ №{order.id.slice(0, 8)}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.className}`}
                >
                  {s.label}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-zinc-500">
                {order.items.map((i) => `${i.product.name} ×${i.quantity}`).join(', ')}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {new Date(order.createdAt).toLocaleString('ru-RU')}
                </span>
                <span className="text-sm font-bold text-zinc-900">{order.total} ₽</span>
              </div>
              {order.bonusEarned > 0 && (
                <p className="mt-1 text-xs font-medium text-emerald-700">+{order.bonusEarned} бонусов</p>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
