'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const statusSteps = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];
const statusLabels: Record<string, string> = {
  PENDING: 'Ожидает',
  CONFIRMED: 'Подтверждён',
  PREPARING: 'Готовится',
  READY: 'Готов',
  COMPLETED: 'Выполнен',
  CANCELLED: 'Отменён',
};

const paymentLabel = (s: string) => {
  if (s === 'SUCCEEDED') return 'Оплачен';
  if (s === 'PENDING') return 'Ожидает оплаты';
  if (s === 'CANCELLED') return 'Платёж отменён';
  return s;
};

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  product: { name: string; image: string | null };
  customizations: { ingredientId: string; action: string; priceDelta: number }[];
}

interface Order {
  id: string;
  status: string;
  total: number;
  discountAmount: number;
  bonusUsed: number;
  bonusEarned: number;
  paymentStatus: string;
  comment: string | null;
  createdAt: string;
  items: OrderItem[];
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetch(`/api/orders/${id}`).then((r) => r.json()),
    refetchInterval: 10000,
  });

  const order: Order | undefined = data?.order;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md px-2 pt-2">
        <div className="glass-tight h-[200px] animate-pulse" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-md px-2 py-16 text-center">
        <p className="text-lg font-semibold text-(--lg-text)">Заказ не найден</p>
        <button type="button" className="btn-primary mt-4" onClick={() => router.push('/orders')}>
          К заказам
        </button>
      </div>
    );
  }

  const activeStep = order.status === 'CANCELLED' ? -1 : statusSteps.indexOf(order.status);

  return (
    <div className="mx-auto max-w-md px-2 pb-6 pt-2">
      <button
        type="button"
        onClick={() => router.push('/orders')}
        className="btn-ghost mb-4 gap-1.5"
      >
        <ArrowLeft className="size-4" />
        Назад
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="heading-section m-0">Заказ №{order.id.slice(0, 8)}</h1>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            order.status === 'CANCELLED'
              ? 'border-rose-400/35 bg-rose-500/18 text-(--lg-text)'
              : order.status === 'COMPLETED'
                ? 'border-emerald-400/35 bg-emerald-500/20 text-(--lg-text)'
                : 'border-sky-400/35 bg-sky-500/18 text-(--lg-text)'
          }`}
        >
          {statusLabels[order.status]}
        </span>
      </div>

      {order.status !== 'CANCELLED' && (
        <div className="glass-panel mb-4 overflow-x-auto p-4">
          <div className="flex min-w-[280px] justify-between gap-1">
            {statusSteps.map((step, i) => {
              const done = i <= activeStep;
              return (
                <div key={step} className="flex min-w-0 flex-1 flex-col items-center text-center">
                  <span
                    className={`mb-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      done ? 'bg-(--lg-text)' : 'bg-[color-mix(in_srgb,var(--lg-text)_22%,transparent)]'
                    }`}
                  />
                  <span className="text-[10px] font-medium leading-tight text-(--lg-text-muted)">
                    {statusLabels[step]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass-panel mb-4 p-4">
        <h2 className="mb-3 text-base font-semibold text-(--lg-text)">Состав заказа</h2>
        {order.items.map((item) => (
          <div
            key={item.id}
            className="flex justify-between gap-2 border-b border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] py-2 last:border-0"
          >
            <div>
              <p className="text-sm text-(--lg-text)">
                {item.product.name} ×{item.quantity}
              </p>
              {item.customizations.length > 0 && (
                <p className="mt-0.5 text-xs text-(--lg-text-muted)">
                  {item.customizations.map((c) => (c.action === 'REMOVE' ? 'Без ' : '+ ') + c.ingredientId).join(', ')}
                </p>
              )}
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-(--lg-text)">
              {item.unitPrice * item.quantity} ₽
            </p>
          </div>
        ))}
        <hr className="my-3 border-[color-mix(in_srgb,var(--lg-text)_12%,transparent)]" />
        {order.discountAmount > 0 && (
          <div className="flex justify-between text-sm text-emerald-500">
            <span>Скидка</span>
            <span>−{order.discountAmount} ₽</span>
          </div>
        )}
        {order.bonusUsed > 0 && (
          <div className="mt-1 flex justify-between text-sm text-amber-500">
            <span>Бонусы</span>
            <span>−{order.bonusUsed} ₽</span>
          </div>
        )}
        <div className="mt-3 flex justify-between text-base font-semibold text-(--lg-text)">
          <span>Итого</span>
          <span className="tabular-nums">{order.total} ₽</span>
        </div>
        {order.bonusEarned > 0 && (
          <p className="mt-2 text-xs font-medium text-emerald-500">Начислено бонусов: +{order.bonusEarned}</p>
        )}
      </div>

      {order.comment && (
        <div className="glass-panel mb-4 p-4">
          <h2 className="mb-1 text-base font-semibold text-(--lg-text)">Комментарий</h2>
          <p className="text-sm text-(--lg-text-muted)">{order.comment}</p>
        </div>
      )}

      <p className="text-center text-xs text-(--lg-text-muted)">
        Оплата: {paymentLabel(order.paymentStatus)} · {new Date(order.createdAt).toLocaleString('ru-RU')}
      </p>
    </div>
  );
}
