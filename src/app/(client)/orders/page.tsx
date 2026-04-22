'use client';

import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const statusMap: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'Ожидает',
    className:
      'border border-[color-mix(in_srgb,var(--lg-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--lg-fill)_88%,transparent)] text-(--lg-text-muted)',
  },
  CONFIRMED: {
    label: 'Подтверждён',
    className: 'border border-sky-400/35 bg-sky-500/18 text-(--lg-text)',
  },
  PREPARING: {
    label: 'Готовится',
    className: 'border border-amber-400/35 bg-amber-500/18 text-(--lg-text)',
  },
  READY: {
    label: 'Готов к выдаче',
    className: 'border border-emerald-400/35 bg-emerald-500/18 text-(--lg-text)',
  },
  COMPLETED: {
    label: 'Выполнен',
    className: 'border border-emerald-400/35 bg-emerald-500/20 text-(--lg-text)',
  },
  CANCELLED: {
    label: 'Отменён',
    className: 'border border-rose-400/35 bg-rose-500/18 text-(--lg-text)',
  },
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
    <div className="mx-auto max-w-md px-2 pb-4 pt-2">
      <h1 className="heading-section mb-4">Мои заказы</h1>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-tight h-[100px] animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="glass-panel py-14 text-center">
          <Receipt className="mx-auto mb-3 size-14 text-(--lg-text-muted) opacity-70" strokeWidth={1.25} />
          <p className="text-base font-medium text-(--lg-text-muted)">Заказов пока нет</p>
        </div>
      ) : (
        orders.map((order) => {
          const s = statusMap[order.status] || {
            label: order.status,
            className:
              'border border-[color-mix(in_srgb,var(--lg-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--lg-fill)_88%,transparent)] text-(--lg-text-muted)',
          };
          return (
            <button
              key={order.id}
              type="button"
              onClick={() => router.push(`/orders/${order.id}`)}
              className="glass-panel mb-3 w-full cursor-pointer p-4 text-left transition"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-(--lg-text)">
                  Заказ №{order.id.slice(0, 8)}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.className}`}
                >
                  {s.label}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-(--lg-text-muted)">
                {order.items.map((i) => `${i.product.name} ×${i.quantity}`).join(', ')}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-(--lg-text-muted)">
                  {new Date(order.createdAt).toLocaleString('ru-RU')}
                </span>
                <span className="text-sm font-bold tabular-nums text-(--lg-text)">{order.total} ₽</span>
              </div>
              {order.bonusEarned > 0 && (
                <p className="mt-1 text-xs font-medium text-emerald-500">+{order.bonusEarned} бонусов</p>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
