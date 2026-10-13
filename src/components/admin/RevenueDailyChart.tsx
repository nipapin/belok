'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { revenueStats } from '@/lib/revenueStats';
import { CAFE_TIME_ZONE } from '@/lib/adminDashboard';
import { useDayWeather, WeatherInline, WeatherCredits } from './DayWeather';

type Stats = ReturnType<typeof revenueStats>;
const number = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
const money = (value: number) => `${number(value)} ₽`;
const compact = (value: number) => new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const dateLabel = (day: string, long = false) => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}), timeZone: CAFE_TIME_ZONE,
}).format(new Date(`${day}T12:00:00Z`));
const payments = [
  { key: 'cash', label: 'Наличные' },
  { key: 'nonCash', label: 'Безналичные · карта и СБП' },
  { key: 'other', label: 'Бонусы / не указан' },
] as const;

export default function RevenueDailyChart({ stats, from, to }: { stats: Stats; from: string; to: string }) {
  const [view, setView] = useState<'revenue' | 'orders'>('revenue');
  const [selected, setSelected] = useState(from);
  const weatherQuery = useDayWeather(from, to);
  const row = stats.daily.find(day => day.day === selected) ?? stats.daily[0];
  const revenueView = view === 'revenue';
  const format = revenueView ? money : number;
  const total = (day: Stats['daily'][number]) => revenueView ? day.paid : day.count;
  const amounts = (day: Stats['daily'][number]) => revenueView ? day.paidAmounts : day.paymentCounts;
  const rawMax = Math.max(1, ...stats.daily.map(total));
  const max = revenueView ? rawMax : Math.ceil(rawMax / 4) * 4;
  const totals = revenueView ? stats.summary.paidAmounts : stats.summary.paymentCounts;

  if (!row) return null;
  return <section className="dashboard-panel revenue-panel revenue-daily" aria-labelledby="revenue-daily-title">
    <div className="revenue-daily-heading">
      <div><h2 id="revenue-daily-title">Продажи по дням</h2><p className="revenue-note">Выберите столбец, чтобы посмотреть день подробнее.</p></div>
      <div className="dashboard-segmented" role="group" aria-label="Показатель по дням">
        <button type="button" aria-pressed={revenueView} onClick={() => setView('revenue')}>Выручка</button>
        <button type="button" aria-pressed={!revenueView} onClick={() => setView('orders')}>Заказы</button>
      </div>
    </div>
    <div className="revenue-daily-legend" aria-label="Способы оплаты за период">
      {payments.filter(payment => payment.key !== 'other' || totals.other > 0).map(payment => <span key={payment.key}>
        <i className={`revenue-color-${payment.key}`} aria-hidden="true" />{payment.label} <strong>{format(totals[payment.key])}</strong>
      </span>)}
    </div>
    <p className="revenue-note revenue-daily-definition">{revenueView ? 'Оплаченные заказы без отмен и списаний, по дате создания.' : 'Все заказы, включая отменённые и списания, по указанному способу оплаты.'}</p>
    <div className="revenue-daily-plot">
      <div className="revenue-daily-axis" aria-hidden="true">{[1, .75, .5, .25, 0].map(fraction => <span key={fraction}>{compact(max * fraction)}{revenueView ? ' ₽' : ''}</span>)}</div>
      <div className="revenue-daily-scroll" role="group" aria-label={revenueView ? 'Выручка по дням, рубли' : 'Количество заказов по дням'} tabIndex={0}>
        <div className="revenue-daily-bars" style={{ gridTemplateColumns: `repeat(${stats.daily.length}, minmax(56px, 1fr))` }}>
          {stats.daily.map(day => <button type="button" className="revenue-daily-column" key={day.day} aria-pressed={day.day === row.day}
            aria-label={`${dateLabel(day.day, true)}: ${revenueView ? `выручка ${money(day.paid)}` : `${day.count} заказов`}. ${payments.map(payment => `${payment.label}: ${format(amounts(day)[payment.key])}`).join(', ')}`}
            onClick={() => setSelected(day.day)}>
            <span className="revenue-daily-value" aria-hidden="true">{compact(total(day))}</span>
            <span className="revenue-daily-track" aria-hidden="true"><span className="revenue-daily-bar" style={{ height: `${total(day) / max * 100}%` }}>
              {payments.map(payment => <span key={payment.key} className={`revenue-color-${payment.key}`} style={{ height: `${total(day) ? amounts(day)[payment.key] / total(day) * 100 : 0}%` }} />)}
            </span></span>
            <span className="revenue-daily-date" aria-hidden="true">{dateLabel(day.day)}</span>
          </button>)}
        </div>
      </div>
    </div>
    <div className="revenue-daily-detail" aria-live="polite" aria-atomic="true">
      <div className="revenue-daily-heading"><strong>{dateLabel(row.day, true)}</strong><Link className="revenue-daily-link" href={`/admin/revenue?from=${row.day}&to=${row.day}`}>Часы и заказы <ArrowRight size={16} aria-hidden="true" /></Link></div>
      <dl><div><dt>Выручка</dt><dd>{money(row.paid)}</dd></div><div><dt>Заказы</dt><dd>{row.count}</dd></div>
        {payments.filter(payment => payment.key !== 'other' || row.paidAmounts.other > 0 || row.paymentCounts.other > 0).map(payment => <div key={payment.key}><dt>{payment.label}</dt><dd>{money(row.paidAmounts[payment.key])} · {row.paymentCounts[payment.key]} зак.</dd></div>)}
        <div><dt>Списания</dt><dd>{money(row.writeOffTotal)} · {row.writeOffCount} шт.</dd></div>
      </dl>
      {weatherQuery.isPending ? <p className="sales-weather-inline">Загружаем погоду…</p> : weatherQuery.isError ? <p className="sales-weather-inline">Погода недоступна. <button className="sales-weather-retry" onClick={() => void weatherQuery.refetch()}>Повторить</button></p> : <WeatherInline weather={weatherQuery.data?.days.find(day => day.day === row.day)} />}
    </div>
    <WeatherCredits weather={weatherQuery.data?.days.find(day => day.day === row.day)} />
  </section>;
}
