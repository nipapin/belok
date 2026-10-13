'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { fetchAdminOrders, CAFE_TIME_ZONE, cafeDay } from '@/lib/adminDashboard';
import { dishSalesStats } from '@/lib/dishSalesStats';
import { clampSalesPeriod } from '@/lib/weather';
import SalesDatePicker from './SalesDatePicker';

const dayLabel = (day: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: CAFE_TIME_ZONE }).format(new Date(`${day}T12:00:00Z`));
const count = (value: number) => new Intl.NumberFormat('ru-RU').format(value);

export default function DishSalesPage({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['admin-orders'], queryFn: fetchAdminOrders, refetchInterval: 10_000 });
  const today = cafeDay(new Date());
  const firstDay = query.data?.orders.reduce<string | null>((first, order) => {
    const day = cafeDay(order.createdAt); return first === null || day < first ? day : first;
  }, null) ?? null;
  const period = firstDay ? clampSalesPeriod(initialFrom, initialTo, firstDay, today) : { from: initialFrom, to: initialTo };
  useEffect(() => {
    if (firstDay && (period.from !== initialFrom || period.to !== initialTo)) router.replace(`/admin/dish-sales?from=${period.from}&to=${period.to}`);
  }, [firstDay, period.from, period.to, initialFrom, initialTo, router]);
  const stats = useMemo(() => dishSalesStats(query.data?.orders ?? [], period.from, period.to), [query.data, period.from, period.to]);
  const dishes = stats.dishes.filter(dish => dish.name.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')));

  return <div className="admin-dashboard revenue-page">
    <Link href="/admin" className="revenue-back"><ArrowLeft size={18} /> Обзор</Link>
    <div className="dashboard-heading"><div><h1>Продажи блюд</h1><p className="dashboard-date">{period.from === period.to ? dayLabel(period.from) : `${dayLabel(period.from)} — ${dayLabel(period.to)}`} · Калининград</p></div>
      <button type="button" className="admin-icon-button" aria-label="Обновить данные" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={19} /></button>
    </div>
    <Link className="revenue-daily-link" href={`/admin/revenue?from=${period.from}&to=${period.to}`}>Выручка за этот период</Link>
    <SalesDatePicker from={period.from} to={period.to} firstDay={firstDay} today={today} onApply={(from, to) => router.push(`/admin/dish-sales?from=${from}&to=${to}`)} />
    {query.isError && <div className="dashboard-error" role="alert"><p>{query.data ? 'Не удалось обновить. Показаны последние загруженные данные.' : 'Не удалось загрузить заказы.'}</p><button onClick={() => void query.refetch()}>Повторить</button></div>}
    {query.isPending ? <p role="status">Загружаем статистику…</p> : query.data && <>
      <section className="revenue-summary" aria-label="Итоги периода">
        {[
          ['Продано, шт.', count(stats.quantity)], ['Наименований продано', count(stats.dishCount)],
          ['Заказов с продажами', count(stats.orderCount)], ['Списано, шт.', count(stats.writeOffQuantity)],
        ].map(([label, value]) => <div className="dashboard-metric-card" key={label}><span className="dashboard-metric-label">{label}</span><strong>{value}</strong></div>)}
      </section>
      <p className="revenue-note">Продажи — количество блюд в оплаченных заказах без отмен, по дате создания заказа. Списания сотрудников показаны отдельно. Варианты и добавки объединены в одно блюдо.</p>
      <section className="dashboard-panel revenue-panel" aria-labelledby="dish-sales-title">
        <div className="revenue-daily-heading"><h2 id="dish-sales-title">Блюда за период</h2><label className="dish-sales-search">Поиск блюда<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Название блюда" /></label></div>
        <p className="revenue-note">От большего количества продаж к меньшему.</p>
        <div className="dish-sales-table-scroll" role="region" aria-labelledby="dish-sales-title" tabIndex={0}>
          <table className="dish-sales-table"><thead><tr><th scope="col">Блюдо</th><th scope="col">Продано, шт.</th><th scope="col">Заказов</th><th scope="col">Списано, шт.</th></tr></thead>
            <tbody>{dishes.map(dish => <tr key={dish.id}><th scope="row">{dish.name}</th><td>{count(dish.quantity)}</td><td>{count(dish.orderCount)}</td><td>{count(dish.writeOffQuantity)}</td></tr>)}</tbody>
            <tfoot><tr><th scope="row">Итого за период</th><td>{count(stats.quantity)}</td><td>{count(stats.orderCount)}</td><td>{count(stats.writeOffQuantity)}</td></tr></tfoot>
          </table>
        </div>
        {dishes.length === 0 && <p className="revenue-note" role="status">{stats.dishes.length ? 'Блюда не найдены.' : 'За этот период продаж и списаний нет.'}</p>}
        <p className="revenue-note">Итог относится ко всему периоду. Заказ с несколькими блюдами учитывается в общем числе заказов один раз.</p>
      </section>
    </>}
  </div>;
}
