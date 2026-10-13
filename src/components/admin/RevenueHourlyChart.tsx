'use client';

import { useState } from 'react';
import type { revenueStats } from '@/lib/revenueStats';

type Stats = ReturnType<typeof revenueStats>;
const money = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value) + '\u00a0₽';
const payments = [
  { key: 'cash', label: 'Наличные' },
  { key: 'nonCash', label: 'Безналичные · карта и СБП' },
  { key: 'other', label: 'Бонусы / не указан' },
] as const;

export default function RevenueHourlyChart({ stats }: { stats: Stats }) {
  const [view, setView] = useState<'orders' | 'revenue'>('orders');
  const revenueView = view === 'revenue';
  const value = (row: Stats['hourly'][number]) => revenueView ? row.paid : row.count;
  const max = Math.max(1, ...stats.hourly.map(value));
  const total = stats.hourly.reduce((sum, row) => sum + value(row), 0);
  const amounts = stats.hourly.reduce((sum, row) => ({
    cash: sum.cash + row.paidAmounts.cash,
    nonCash: sum.nonCash + row.paidAmounts.nonCash,
    other: sum.other + row.paidAmounts.other,
  }), { cash: 0, nonCash: 0, other: 0 });

  return <section className="dashboard-panel revenue-panel revenue-hourly" aria-labelledby="revenue-hourly-title">
    <div className="revenue-daily-heading">
      <h2 id="revenue-hourly-title">{revenueView ? 'Выручка' : 'Заказы'} по рабочим часам · 08:00–21:00</h2>
      <div className="dashboard-segmented" role="group" aria-label="Показатель по часам">
        <button type="button" aria-pressed={!revenueView} onClick={() => setView('orders')}>Заказы</button>
        <button type="button" aria-pressed={revenueView} onClick={() => setView('revenue')}>Выручка</button>
      </div>
    </div>
    <p className="revenue-note" aria-live="polite">{revenueView
      ? `Выручка за рабочие часы: ${money(total)}. Только оплаченные заказы без отмен и списаний, по времени создания. Вне рабочих часов: ${money(stats.outsideHoursPaid)}.`
      : `Суммарно за выбранный период: ${total} заказов. Отменённые исключены, списания включены и отмечены отдельно. Вне рабочих часов: ${stats.outsideHours}.`}</p>
    {revenueView && <div className="revenue-daily-legend revenue-hourly-legend" aria-label="Способы оплаты за рабочие часы">
      {payments.filter(payment => payment.key !== 'other' || amounts.other !== 0).map(payment => <span key={payment.key}>
        <i className={`revenue-color-${payment.key}`} aria-hidden="true" />{payment.label} <strong>{money(amounts[payment.key])}</strong>
      </span>)}
    </div>}
    <div className={`revenue-hours${revenueView ? ' is-revenue' : ''}`}>
      {stats.hourly.map(row => <div className="revenue-hour" key={row.hour}>
        <span>{String(row.hour).padStart(2, '0')}:00–{String(row.hour + 1).padStart(2, '0')}:00</span>
        <div className="revenue-hour-track" aria-hidden="true"><div style={{ width: `${value(row) / max * 100}%` }}>
          {revenueView && payments.map(payment => <span key={payment.key} className={`revenue-color-${payment.key}`} style={{ width: `${row.paid ? row.paidAmounts[payment.key] / row.paid * 100 : 0}%` }} />)}
        </div></div>
        <strong>{revenueView ? money(row.paid) : row.count} <small>({total ? Math.round(value(row) / total * 100) : 0}%)</small></strong>
        <span className="revenue-hour-detail">{revenueView
          ? <>Наличные: {money(row.paidAmounts.cash)} · Безналичные: {money(row.paidAmounts.nonCash)}{row.paidAmounts.other !== 0 && ` · Бонусы / не указан: ${money(row.paidAmounts.other)}`}</>
          : <>{money(row.paid)}{row.writeOffs > 0 && ` · списаний: ${row.writeOffs}`}</>}</span>
      </div>)}
    </div>
  </section>;
}
