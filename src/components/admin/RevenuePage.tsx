'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { fetchAdminOrders, CAFE_TIME_ZONE, cafeDay } from '@/lib/adminDashboard';
import { revenueStats, validDay } from '@/lib/revenueStats';
import { orderCustomerLabel, orderTicket, paymentMethodLabel } from '@/lib/orderCustomer';
import { OrderItemsList, ORDER_STATUS_LABELS } from '@/components/admin/OrderItemsList';

const money = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value) + ' ₽';
const dayLabel = (day: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: CAFE_TIME_ZONE }).format(new Date(`${day}T12:00:00Z`));
const timeLabel = (date: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: CAFE_TIME_ZONE }).format(new Date(date));

export default function RevenuePage({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const query = useQuery({ queryKey: ['admin-orders'], queryFn: fetchAdminOrders, refetchInterval: 10_000 });
  const stats = revenueStats(query.data?.orders ?? [], initialFrom, initialTo);
  const { summary } = stats;
  const max = Math.max(1, ...stats.hourly.map(row => row.count));
  const workingCount = stats.hourly.reduce((sum, row) => sum + row.count, 0);
  const invalid = !validDay(from) || !validDay(to) || from > to;

  return <div className="admin-dashboard revenue-page">
    <Link href="/admin" className="revenue-back"><ArrowLeft size={18} /> Обзор</Link>
    <div className="dashboard-heading"><div><h1>Выручка и ритм заказов</h1><p className="dashboard-date">{initialFrom === initialTo ? dayLabel(initialFrom) : `${dayLabel(initialFrom)} — ${dayLabel(initialTo)}`} · Калининград</p></div>
      <button type="button" className="admin-icon-button" aria-label="Обновить данные" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={19} /></button>
    </div>
    <form className="revenue-period" onSubmit={event => { event.preventDefault(); if (!invalid) router.push(`/admin/revenue?from=${from}&to=${to}`); }}>
      <label>С даты<input type="date" value={from} onChange={event => setFrom(event.target.value)} required /></label>
      <label>По дату включительно<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} required /></label>
      <button className="btn-primary" disabled={invalid}>Показать</button>
      {invalid && <p role="alert">Укажите корректные даты: начало не позже конца периода.</p>}
    </form>
    {query.isError && <div className="dashboard-error" role="alert"><p>{query.data ? 'Не удалось обновить. Показаны последние загруженные данные.' : 'Не удалось загрузить заказы.'}</p><button onClick={() => void query.refetch()}>Повторить</button></div>}
    {query.isPending ? <p role="status">Загружаем статистику…</p> : query.data && <>
      <section className="revenue-summary" aria-label="Итоги периода">
        {[
          ['Выручка', money(summary.paid)], ['Наличные', money(summary.paidAmounts.cash)],
          ['Безналичные · карта и СБП', money(summary.paidAmounts.nonCash)], ['Бонусы / способ не указан', money(summary.paidAmounts.other)],
          ['Всего заказов', String(summary.count)], ['Списания', `${money(summary.writeOffTotal)} · ${summary.writeOffCount} шт.`],
        ].map(([label, value]) => <div className="dashboard-metric-card" key={label}><span className="dashboard-metric-label">{label}</span><strong>{value}</strong></div>)}
      </section>
      <p className="revenue-note">Выручка — оплаченные заказы без отмен и списаний, сгруппированные по дате создания заказа. Сумма списаний — стоимость заказов сотрудников, не себестоимость. Способ оплаты «Бонусы / не указан» показан отдельно.</p>
      <section className="dashboard-panel revenue-panel"><h2>Каждый день</h2><p className="revenue-note">Нажмите на дату, чтобы посмотреть итог, часы и заказы этого дня.</p>
        <div className="revenue-days-mobile">{stats.daily.map(row => <Link className="revenue-day-card" key={row.day} href={`/admin/revenue?from=${row.day}&to=${row.day}`}>
          <div><strong>{dayLabel(row.day)}</strong><ChevronRight size={17} /></div>
          <dl><div><dt>Заказы</dt><dd>{row.count}</dd></div><div><dt>Выручка</dt><dd>{money(row.paid)}</dd></div>
            <div><dt>Наличные</dt><dd>{money(row.paidAmounts.cash)}</dd></div><div><dt>Безналичные</dt><dd>{money(row.paidAmounts.nonCash)}</dd></div>
            <div><dt>Бонусы / не указан</dt><dd>{money(row.paidAmounts.other)}</dd></div><div><dt>Списания · {row.writeOffCount} шт.</dt><dd>{money(row.writeOffTotal)}</dd></div>
          </dl>
        </Link>)}</div>
        <div className="admin-table-wrap revenue-days-desktop"><table className="admin-table revenue-table"><thead><tr><th>День</th><th>Заказы</th><th>Выручка</th><th>Наличные</th><th>Безналичные</th><th>Бонусы / не указан</th><th>Списания</th></tr></thead>
          <tbody>{stats.daily.map(row => <tr key={row.day}><td><Link href={`/admin/revenue?from=${row.day}&to=${row.day}`}>{dayLabel(row.day)}</Link></td><td>{row.count}</td><td>{money(row.paid)}</td><td>{money(row.paidAmounts.cash)}</td><td>{money(row.paidAmounts.nonCash)}</td><td>{money(row.paidAmounts.other)}</td><td>{money(row.writeOffTotal)} · {row.writeOffCount}</td></tr>)}</tbody>
          <tfoot><tr><th>Итого</th><td>{summary.count}</td><td>{money(summary.paid)}</td><td>{money(summary.paidAmounts.cash)}</td><td>{money(summary.paidAmounts.nonCash)}</td><td>{money(summary.paidAmounts.other)}</td><td>{money(summary.writeOffTotal)} · {summary.writeOffCount}</td></tr></tfoot>
        </table></div>
      </section>
      <section className="dashboard-panel revenue-panel"><h2>Заказы по рабочим часам · 08:00–21:00</h2><p className="revenue-note">Суммарно за выбранный период: {workingCount} заказов. Отменённые исключены, списания включены и отмечены отдельно. Вне рабочих часов: {stats.outsideHours}.</p>
        <div className="revenue-hours">{stats.hourly.map(row => <div className="revenue-hour" key={row.hour}>
          <span>{String(row.hour).padStart(2, '0')}:00–{row.hour + 1}:00</span>
          <div className="revenue-hour-track" aria-hidden="true"><div style={{ width: `${row.count / max * 100}%` }} /></div>
          <strong>{row.count} <small>({workingCount ? Math.round(row.count / workingCount * 100) : 0}%)</small></strong>
          <span className="revenue-hour-detail">{money(row.paid)}{row.writeOffs > 0 && ` · списаний: ${row.writeOffs}`}</span>
        </div>)}</div>
      </section>
      <section className="dashboard-panel revenue-panel"><h2>Заказы за период · {stats.orders.length}</h2><p className="revenue-note">Все статусы, включая отменённые. Заказ можно открыть для просмотра состава и деталей.</p>
        <div className="revenue-order-list">{stats.orders.length === 0 ? <p>За этот период заказов нет.</p> : stats.orders.map(order => <Link key={order.id} href={`/admin/orders/${order.id}`} className="dashboard-order-card">
          <div className="dashboard-order-top"><span className="dashboard-ticket">{orderTicket(order)}</span><span className={`dashboard-status status-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]?.label ?? order.status}</span>{order.isWriteOff && <span className="revenue-writeoff">Списание</span>}<strong>{money(Number(order.total))}</strong><ChevronRight size={17} /></div>
          <div className="dashboard-order-customer"><span>{orderCustomerLabel(order)}</span><time dateTime={order.createdAt}>{dayLabel(cafeDay(order.createdAt))} · {timeLabel(order.createdAt)}</time></div>
          <OrderItemsList items={order.items} /><div className="dashboard-order-footnote">{paymentMethodLabel(order.paymentMethod) ?? 'Способ оплаты не указан'} · {order.paymentStatus === 'SUCCEEDED' ? 'Оплачено' : order.paymentStatus === 'CANCELLED' ? 'Платёж отменён' : 'Ожидает оплаты'}{order.comment && ` · ${order.comment}`}</div>
        </Link>)}</div>
      </section>
    </>}
  </div>;
}
