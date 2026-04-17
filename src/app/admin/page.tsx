'use client';

import { Banknote, Receipt, Users, UtensilsCrossed } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface StatCard {
  label: string;
  value: string | number;
  icon: typeof Receipt;
}

export default function AdminDashboard() {
  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => fetch('/api/admin/orders').then((r) => r.json()),
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => fetch('/api/admin/users').then((r) => r.json()),
  });

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => fetch('/api/admin/products').then((r) => r.json()),
  });

  const orders = ordersData?.orders ?? [];
  const users = usersData?.users ?? [];
  const products = productsData?.products ?? [];

  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (o: { createdAt: string }) => new Date(o.createdAt).toDateString() === today
  );
  const todayRevenue = todayOrders.reduce((s: number, o: { total: number }) => s + o.total, 0);

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
                <div className="h-[120px] animate-pulse rounded-xl bg-white/40" />
              ) : (
                <>
                  <Icon className="mx-auto mb-2 size-9 text-zinc-800" strokeWidth={1.5} />
                  <p className="text-xl font-bold text-zinc-900">{stat.value}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">{stat.label}</p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-zinc-900">Последние заказы</h2>
      <div className="space-y-2">
        {orders.slice(0, 5).map(
          (order: {
            id: string;
            status: string;
            total: number;
            createdAt: string;
            user: { phone: string; name: string | null };
          }) => (
            <div key={order.id} className="glass-panel flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900">№{order.id.slice(0, 8)}</p>
                <p className="text-xs text-zinc-500">
                  {order.user?.name || order.user?.phone} ·{' '}
                  {new Date(order.createdAt).toLocaleString('ru-RU')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-zinc-900">{order.total} ₽</p>
                <p className="text-xs text-zinc-500">{order.status}</p>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
