'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHaptic } from '@/hooks/useHaptic';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import {
  ORDER_STATUS_LABELS,
  OrderItemsList,
  type OrderItemView,
} from '@/components/admin/OrderItemsList';
import { fulfillmentLabel, isKioskSource, orderCustomerLabel, orderTicket } from '@/lib/orderCustomer';

interface Order {
  id: string;
  status: string;
  total: number;
  bonusUsed: number;
  discountAmount: number;
  paymentStatus: string;
  fulfillment?: string | null;
  deliveryAddress?: string | null;
  comment: string | null;
  guestEmail: string | null;
  source: string;
  dailyNumber?: number | null;
  createdAt: string;
  user: { phone: string | null; email: string | null; name: string | null } | null;
  items: OrderItemView[];
}

function customerLabel(order: Order): string {
  return orderCustomerLabel(order);
}

function SourceBadge({ source }: { source: string }) {
  if (!isKioskSource(source)) return null;
  return (
    <span className="ml-1.5 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
      Касса
    </span>
  );
}

function announceNewOrders(orders: Order[]) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  for (const order of orders) {
    try {
      new Notification('Новый заказ', {
        body: `${customerLabel(order)} · ${order.total} ₽`,
        tag: `order-new-${order.id}`,
      });
    } catch {
      /* Safari can throw if the page is not yet fully active */
    }
  }
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const push = usePushSubscription();
  const seenIds = useRef<Set<string> | null>(null);
  const [freshCount, setFreshCount] = useState(0);

  const { data } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => fetch('/api/admin/orders').then((r) => r.json()),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  const orders: Order[] = useMemo(() => data?.orders ?? [], [data?.orders]);

  useEffect(() => {
    const ids = new Set(orders.map((order) => order.id));
    if (seenIds.current === null) {
      seenIds.current = ids;
      return;
    }
    const newcomers = orders.filter(
      (order) => !seenIds.current!.has(order.id) && order.status === 'PENDING'
    );
    seenIds.current = ids;
    if (newcomers.length === 0) return;
    setFreshCount((n) => n + newcomers.length);
    haptic('warning');
    announceNewOrders(newcomers);
  }, [orders, haptic]);

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/admin/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order'] });
    },
  });

  return (
    <div>
      <h1 className="heading-section mb-6">Заказы</h1>
      {push.status === 'not-subscribed' || push.status === 'ios-needs-install' || push.status === 'denied' ? (
        <div className="mb-4 rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-4 py-3 text-sm text-(--lg-text)">
          <p className="font-medium">Push-уведомления о заказах выключены</p>
          <p className="mt-1 text-(--lg-text-muted)">
            {push.status === 'ios-needs-install'
              ? 'Добавьте приложение на домашний экран, затем включите уведомления.'
              : push.status === 'denied'
                ? 'Разрешите уведомления в системных настройках телефона.'
                : 'Включите, чтобы узнавать о заказах, даже если админка закрыта.'}
          </p>
          {push.status === 'not-subscribed' ? (
            <button
              type="button"
              className="mt-3 rounded-xl bg-[#18181b] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              disabled={push.busy}
              onClick={() => void push.enable()}
            >
              Включить уведомления
            </button>
          ) : null}
        </div>
      ) : null}
      {freshCount > 0 ? (
        <button
          type="button"
          className="mb-4 w-full rounded-2xl border border-amber-400/40 bg-amber-100 px-4 py-3 text-left text-sm font-semibold text-amber-950"
          onClick={() => setFreshCount(0)}
        >
          {freshCount === 1
            ? 'Пришёл новый заказ — обновили список'
            : `Новых заказов: ${freshCount} — обновили список`}
        </button>
      ) : null}

      <div className="hidden min-[900px]:block">
        <div className="admin-table-wrap overflow-x-auto">
          <table className="admin-table min-w-[960px]">
            <thead>
              <tr>
                <th>№</th>
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
                <tr
                  key={order.id}
                  className="cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--lg-text)_5%,transparent)]"
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
                >
                  <td className="font-mono text-xs">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-mono text-xs underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {orderTicket(order)}
                    </Link>
                  </td>
                  <td>
                    {customerLabel(order)}
                    <SourceBadge source={order.source} />
                    {fulfillmentLabel(order.fulfillment) ? (
                      <span className="mt-0.5 block text-xs text-(--lg-text-muted)">
                        {fulfillmentLabel(order.fulfillment)}
                        {order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}
                      </span>
                    ) : null}
                  </td>
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
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateStatus.mutate({ id: order.id, status: e.target.value })}
                      aria-label="Статус заказа"
                    >
                      {Object.entries(ORDER_STATUS_LABELS).map(([key, val]) => (
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
          <div key={order.id} className="glass-panel p-4">
            <Link href={`/admin/orders/${order.id}`} className="block space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold tabular-nums text-(--lg-text)">{orderTicket(order)}</p>
                <p className="text-xs text-(--lg-text-muted)">
                  {new Date(order.createdAt).toLocaleString('ru-RU')}
                </p>
              </div>
              <p className="text-sm font-medium text-(--lg-text)">
                {customerLabel(order)}
                <SourceBadge source={order.source} />
              </p>
              {fulfillmentLabel(order.fulfillment) ? (
                <p className="text-xs text-(--lg-text-muted)">
                  {fulfillmentLabel(order.fulfillment)}
                  {order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}
                </p>
              ) : null}
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
            </Link>
            <label className="mt-3 block text-xs font-medium text-(--lg-text-muted)">
              Статус
              <select
                className="select-pill mt-1 w-full py-2.5 text-sm font-medium"
                value={order.status}
                onChange={(e) => updateStatus.mutate({ id: order.id, status: e.target.value })}
                aria-label="Статус заказа"
              >
                {Object.entries(ORDER_STATUS_LABELS).map(([key, val]) => (
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
