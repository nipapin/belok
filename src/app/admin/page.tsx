'use client';

import Link from 'next/link';
import { Banknote, Receipt, Users, UtensilsCrossed } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  ORDER_STATUS_LABELS,
  OrderItemsList,
  type OrderItemView,
} from '@/components/admin/OrderItemsList';

import { orderCustomerLabel, orderTicket } from '@/lib/orderCustomer';

interface StatCard {
  label: string;
  value: string | number;
  icon: typeof Receipt;
}

interface DashboardOrder {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  comment: string | null;
  user: { phone: string | null; email: string | null; name: string | null } | null;
  guestEmail?: string | null;
  dailyNumber?: number | null;
  items: OrderItemView[];
}

export default function AdminDashboard() {
  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => fetch('/api/admin/orders').then((r) => r.json()),
    refetchInterval: 10_000,
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => fetch('/api/admin/users').then((r) => r.json()),
  });

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => fetch('/api/admin/products').then((r) => r.json()),
  });

  const orders: DashboardOrder[] = ordersData?.orders ?? [];
  const users = usersData?.users ?? [];
  const products = productsData?.products ?? [];

  const today = new Date().toDateString();
  const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === today);
  const todayRevenue = todayOrders
    .filter((o) => o.status !== 'CANCELLED')
    .reduce((s, o) => s + Number(o.total), 0);

  const isLoading = loadingOrders || loadingUsers || loadingProducts;

  const stats: StatCard[] = [
    { label: 'Заказов сегодня', value: todayOrders.length, icon: Receipt },
    { label: 'Выручка сегодня', value: `${todayRevenue} ₽`, icon: Banknote },
    { label: 'Пользователей', value: users.length, icon: Users },
    { label: 'Позиций в меню', value: products.length, icon: UtensilsCrossed },
  ];

  return (
    <div>
      <h1 className="heading-section mb-6">Дашборд</h1>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="glass-panel p-4 text-center sm:p-5">
              {isLoading ? (
                <div className="h-[120px] animate-pulse rounded-xl bg-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]" />
              ) : (
                <>
                  <Icon className="mx-auto mb-2 size-9 text-(--lg-text)" strokeWidth={1.5} />
                  <p className="text-xl font-bold text-(--lg-text)">{stat.value}</p>
                  <p className="mt-1 text-xs font-medium text-(--lg-text-muted)">{stat.label}</p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-(--lg-text)">Последние заказы</h2>
      <div className="space-y-3">
        {orders.slice(0, 5).map((order) => {
          const status = ORDER_STATUS_LABELS[order.status];
          return (
            <Link
              key={order.id}
              href={`/admin/orders/${order.id}`}
              className="glass-panel block space-y-3 p-4 transition hover:border-(--lg-ring-strong) hover:bg-(--lg-fill-hover)"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold tabular-nums text-(--lg-text)">{orderTicket(order)}</p>
                  <p className="text-xs text-(--lg-text-muted)">
                    {orderCustomerLabel(order)} ·{' '}
                    {new Date(order.createdAt).toLocaleString('ru-RU')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-(--lg-text)">{order.total} ₽</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${status?.chip ?? 'admin-chip-neutral'}`}
                  >
                    {status?.label ?? order.status}
                  </span>
                </div>
              </div>
              <OrderItemsList items={order.items ?? []} />
              {order.comment ? (
                <p className="text-xs italic text-(--lg-text-muted)">Комментарий: {order.comment}</p>
              ) : null}
            </Link>
          );
        })}
        {!isLoading && orders.length === 0 ? (
          <p className="text-sm text-(--lg-text-muted)">Заказов пока нет</p>
        ) : null}
      </div>
    </div>
  );
}
