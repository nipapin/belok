'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { fetchAdminOrders, CAFE_TIME_ZONE, cafeDay } from '@/lib/adminDashboard';
import { revenueStats } from '@/lib/revenueStats';
import { clampSalesPeriod } from '@/lib/weather';
import SalesDatePicker from './SalesDatePicker';
import DayWeather, { useDayWeather, WeatherInline, WeatherCredits } from './DayWeather';
import { orderCustomerLabel, orderTicket, paymentMethodLabel } from '@/lib/orderCustomer';
import { OrderItemsList, ORDER_STATUS_LABELS } from '@/components/admin/OrderItemsList';

const money = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value) + ' ₽';
const dayLabel = (day: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: CAFE_TIME_ZONE }).format(new Date(`${day}T12:00:00Z`));
const timeLabel = (date: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: CAFE_TIME_ZONE }).format(new Date(date));

export default function RevenuePage({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const router = useRouter();
  const query = useQuery({ queryKey: ['admin-orders'], queryFn: fetchAdminOrders, refetchInterval: 10_000 });
  const today = cafeDay(new Date());
  const firstDay = query.data?.orders.reduce<string | null>((first, order) => {
    const day = cafeDay(order.createdAt); return first === null || day < first ? day : first;
  }, null) ?? null;
  const period = firstDay ? clampSalesPeriod(initialFrom, initialTo, firstDay, today) : { from: initialFrom, to: initialTo };
  useEffect(() => {
    if (firstDay && (period.from !== initialFrom || period.to !== initialTo)) router.replace(`/admin/revenue?from=${period.from}&to=${period.to}`);
  }, [firstDay, period.from, period.to, initialFrom, initialTo, router]);
  const weatherQuery = useDayWeather(period.from, period.to);
  const weatherByDay = new Map((weatherQuery.data?.days ?? []).map(day => [day.day, day]));
  const stats = revenueStats(query.data?.orders ?? [], period.from, period.to);
  const { summary } = stats;
  const max = Math.max(1, ...stats.hourly.map(row => row.count));
  const workingCount = stats.hourly.reduce((sum, row) => sum + row.count, 0);

  return <div className="admin-dashboard revenue-page">
    <Link href="/admin" className="revenue-back"><ArrowLeft size={18} /> Обзор</Link>
    <div className="dashboard-heading"><div><h1>Продажи</h1><p className="dashboard-date">{period.from === period.to ? dayLabel(period.from) : `${dayLabel(period.from)} — ${dayLabel(period.to)}`} · Калининград</p></div>
      <button type="button" className="admin-icon-button" aria-label="Обновить данные" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={19} /></button>
    </div>
    <SalesDatePicker from={period.from} to={period.to} firstDay={firstDay} today={today} onApply={(from, to) => router.push(`/admin/revenue?from=${from}&to=${to}`)} />
    {period.from === period.to && <DayWeather day={period.from} />}
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
        {weatherQuery.isError && <p className="revenue-note" role="status">Не удалось загрузить погоду. <button className="sales-weather-retry" onClick={() => void weatherQuery.refetch()}>Повторить</button></p>}
        <div className="revenue-days-mobile">{stats.daily.map(row => <Link className="revenue-day-card" key={row.day} href={`/admin/revenue?from=${row.day}&to=${row.day}`}>
          <div><strong>{dayLabel(row.day)}</strong><ChevronRight size={17} /></div>
          <dl><div><dt>Заказы</dt><dd>{row.count}</dd></div><div><dt>Выручка</dt><dd>{money(row.paid)}</dd></div>
            <div><dt>Наличные</dt><dd>{money(row.paidAmounts.cash)}</dd></div><div><dt>Безналичные</dt><dd>{money(row.paidAmounts.nonCash)}</dd></div>
            <div><dt>Бонусы / не указан</dt><dd>{money(row.paidAmounts.other)}</dd></div><div><dt>Списания · {row.writeOffCount} шт.</dt><dd>{money(row.writeOffTotal)}</dd></div>
          </dl>
          <div className="sales-weather-history">{weatherQuery.isPending ? <span className="sales-weather-inline">Загружаем погоду…</span> : weatherQuery.isError ? <span className="sales-weather-inline">Погода недоступна</span> : <WeatherInline weather={weatherByDay.get(row.day)} />}</div>
        </Link>)}</div>
        <div className="admin-table-wrap revenue-days-desktop"><table className="admin-table revenue-table"><thead><tr><th>День</th><th>Заказы</th><th>Выручка</th><th>Наличные</th><th>Безналичные</th><th>Бонусы / не указан</th><th>Списания</th><th>Погода · 08–21</th></tr></thead>
          <tbody>{stats.daily.map(row => <tr key={row.day}><td><Link href={`/admin/revenue?from=${row.day}&to=${row.day}`}>{dayLabel(row.day)}</Link></td><td>{row.count}</td><td>{money(row.paid)}</td><td>{money(row.paidAmounts.cash)}</td><td>{money(row.paidAmounts.nonCash)}</td><td>{money(row.paidAmounts.other)}</td><td>{money(row.writeOffTotal)} · {row.writeOffCount}</td><td>{weatherQuery.isPending ? 'Загрузка…' : weatherQuery.isError ? 'Недоступна' : <WeatherInline weather={weatherByDay.get(row.day)} />}</td></tr>)}</tbody>
          <tfoot><tr><th>Итого</th><td>{summary.count}</td><td>{money(summary.paid)}</td><td>{money(summary.paidAmounts.cash)}</td><td>{money(summary.paidAmounts.nonCash)}</td><td>{money(summary.paidAmounts.other)}</td><td>{money(summary.writeOffTotal)} · {summary.writeOffCount}</td><td>—</td></tr></tfoot>
        </table></div>
        <WeatherCredits />
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
