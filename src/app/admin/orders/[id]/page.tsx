'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ORDER_STATUS_LABELS,
  OrderItemsList,
  type OrderItemView,
} from '@/components/admin/OrderItemsList';

import { isKioskSource, orderCustomerLabel } from '@/lib/orderCustomer';

interface AdminOrder {
  id: string;
  status: string;
  total: number;
  discountAmount: number;
  bonusUsed: number;
  bonusEarned: number;
  paymentStatus: string;
  comment: string | null;
  guestEmail: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    name: string | null;
  } | null;
  items: OrderItemView[];
}

function paymentLabel(status: string) {
  if (status === 'SUCCEEDED') return 'Оплачен';
  if (status === 'PENDING') return 'Ожидает оплаты';
  if (status === 'CANCELLED') return 'Платёж отменён';
  return status;
}

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/orders/${id}`);
      if (!res.ok) throw new Error('not-found');
      return res.json() as Promise<{ order: AdminOrder }>;
    },
    enabled: Boolean(id),
    refetchInterval: 10_000,
    retry: false,
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      fetch(`/api/admin/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    },
  });

  if (isLoading) {
    return (
      <div>
        <div className="glass-panel h-[280px] animate-pulse" />
      </div>
    );
  }

  const order = data?.order;
  if (isError || !order) {
    return (
      <div className="py-10 text-center">
        <p className="text-lg font-semibold text-(--lg-text)">Заказ не найден</p>
        <button type="button" className="btn-primary mt-4" onClick={() => router.push('/admin/orders')}>
          К заказам
        </button>
      </div>
    );
  }

  const status = ORDER_STATUS_LABELS[order.status];
  const customer = orderCustomerLabel(order);
  const kiosk = isKioskSource(order.source);

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="btn-ghost inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm"
        onClick={() => router.push('/admin/orders')}
      >
        <ArrowLeft className="size-4" strokeWidth={2} />
        Заказы
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="heading-section">Заказ №{order.id.slice(0, 8)}</h1>
          <p className="mt-1 text-sm text-(--lg-text-muted)">
            {new Date(order.createdAt).toLocaleString('ru-RU')}
          </p>
        </div>
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${status?.chip ?? 'admin-chip-neutral'}`}
        >
          {status?.label ?? order.status}
        </span>
      </div>

      <section className="glass-panel space-y-2 p-4">
        <h2 className="text-sm font-semibold text-(--lg-text)">Клиент</h2>
        <p className="text-base font-medium text-(--lg-text)">
          {customer}
          {kiosk ? (
            <span className="ml-2 inline-block rounded-full bg-violet-100 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-violet-800">
              Касса
            </span>
          ) : null}
        </p>
        {order.user?.phone ? (
          <p className="text-sm text-(--lg-text-muted)">{order.user.phone}</p>
        ) : null}
        {order.user?.email || order.guestEmail ? (
          <p className="text-sm text-(--lg-text-muted)">{order.user?.email || order.guestEmail}</p>
        ) : null}
        {!order.user && order.guestEmail ? (
          <p className="text-xs text-(--lg-text-muted)">Приглашение отправлено — аккаунт ещё не создан</p>
        ) : null}
      </section>

      <section className="glass-panel space-y-3 p-4">
        <h2 className="text-sm font-semibold text-(--lg-text)">Состав</h2>
        <OrderItemsList items={order.items ?? []} />
        {order.comment ? (
          <p className="border-t border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] pt-3 text-sm italic text-(--lg-text-muted)">
            Комментарий: {order.comment}
          </p>
        ) : null}
      </section>

      <section className="glass-panel space-y-2 p-4">
        <h2 className="text-sm font-semibold text-(--lg-text)">Оплата и итог</h2>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-2xl font-bold tabular-nums text-(--lg-text)">{order.total} ₽</p>
          <span
            className={
              order.paymentStatus === 'SUCCEEDED'
                ? 'inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                : 'admin-chip-neutral'
            }
          >
            {paymentLabel(order.paymentStatus)}
          </span>
        </div>
        {order.discountAmount > 0 ? (
          <p className="text-sm text-sky-700">Скидка: −{order.discountAmount} ₽</p>
        ) : null}
        {order.bonusUsed > 0 ? (
          <p className="text-sm text-amber-700">Списано бонусов: −{order.bonusUsed} ₽</p>
        ) : null}
        {order.bonusEarned > 0 ? (
          <p className="text-sm text-(--lg-text-muted)">Начислено бонусов: +{order.bonusEarned}</p>
        ) : null}
      </section>

      <section className="glass-panel space-y-2 p-4">
        <h2 className="text-sm font-semibold text-(--lg-text)">Статус</h2>
        <select
          className="select-pill w-full max-w-xs py-2.5 text-sm font-medium"
          value={order.status}
          disabled={updateStatus.isPending}
          onChange={(e) => updateStatus.mutate(e.target.value)}
          aria-label="Статус заказа"
        >
          {Object.entries(ORDER_STATUS_LABELS).map(([key, val]) => (
            <option key={key} value={key}>
              {val.label}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}
