'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Receipt, RefreshCw } from 'lucide-react';
import { cafeDay, CAFE_TIME_ZONE } from '@/lib/adminDashboard';
import { paymentLabels, type ManagerReport } from '@/lib/managerReports';
import { ORDER_STATUS_LABELS } from '@/components/admin/OrderItemsList';
import '../manager/manager.css';

const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: CAFE_TIME_ZONE, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
async function fetchReport(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? 'Не удалось загрузить отчет');
  return data as ManagerReport;
}
export default function ReportsPage() {
  const [from, setFrom] = useState(() => cafeDay(new Date()));
  const [to, setTo] = useState(() => cafeDay(new Date()));
  const [search, setSearch] = useState('');
  const [payment, setPayment] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [filters, setFilters] = useState(() => ({ from: cafeDay(new Date()), to: cafeDay(new Date()), search: '', payment: '', cancelled: false }));
  const params = new URLSearchParams({ ...filters, cancelled: String(filters.cancelled), page: String(page) });
  const url = '/api/admin/reports?' + params;
  const report = useQuery({ queryKey: ['manager-report', filters, page], queryFn: () => fetchReport(url), refetchInterval: 30000 });
  const data = report.data;
  function preset(days: number) {
    const end = cafeDay(new Date());
    const start = new Date(`${end}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - days + 1);
    const beginning = start.toISOString().slice(0, 10);
    setFrom(beginning); setTo(end); setPage(1);
    setFilters({ from: beginning, to: end, search, payment, cancelled });
  }
  async function download() {
    setExporting(true); setExportError('');
    try {
      const response = await fetch(url + '&format=csv', { cache: 'no-store' });
      if (!response.ok) throw Error((await response.json()).error ?? 'Не удалось выгрузить отчет');
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = blobUrl; link.download = `report-${filters.from}-${filters.to}.csv`;
      link.click(); window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) { setExportError(error instanceof Error ? error.message : 'Ошибка выгрузки'); }
    finally { setExporting(false); }
  }
  return <div className="manager-space">
    <header className="manager-heading"><div><p className="dashboard-eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО УПРАВЛЯЮЩЕГО</p><h1>Отчетность</h1><p>Заказы и блюда за любой период · время Калининграда.</p></div><BarChart3 size={28} /></header>
    <div className="manager-tools">{[{ label: 'Сегодня', days: 1 }, { label: '7 дней', days: 7 }, { label: '30 дней', days: 30 }, { label: 'Год', days: 365 }, { label: '2 года', days: 730 }].map(p => <button className="manager-button" key={p.days} onClick={() => preset(p.days)}>{p.label}</button>)}</div>
    <form className="manager-panel manager-tools" onSubmit={e => { e.preventDefault(); setPage(1); setFilters({ from, to, search: search.trim(), payment, cancelled }); }}>
      <label><span>С даты</span><input type="date" required value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label>
      <label><span>По дату включительно</span><input type="date" required value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
      <label><span>Блюдо или вариант</span><input type="search" maxLength={160} value={search} onChange={e => setSearch(e.target.value)} placeholder="Все блюда" /></label>
      <label><span>Тип оплаты</span><select value={payment} onChange={e => setPayment(e.target.value)}><option value="">Все типы</option>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="manager-check"><input type="checkbox" checked={cancelled} onChange={e => setCancelled(e.target.checked)} /> Включить отмененные</label>
      <button className="manager-button primary" type="submit">Показать отчет</button>
    </form>
    <p className="manager-caption">Показан период: {filters.from} — {filters.to}. Сумма заказов учитывает каждый заказ один раз. При поиске блюда это полная сумма заказов, в которых оно встречается; количество относится к найденным позициям.</p>
    {report.isError && <div role="alert" className="manager-note">{report.error.message}. <button onClick={() => void report.refetch()}>Повторить</button>{data && ' Показаны последние загруженные данные.'}</div>}
    <div className="manager-stats" aria-busy={report.isPending}>
      {[['Сумма заказов', data ? money(data.summary.total) : '—'], ['Оплачено', data ? money(data.summary.paid) : '—'], ['Заказов', data?.summary.orders ?? '—'], ['Количество блюд', data?.summary.quantity ?? '—']].map(([label, value], index) => <div className="manager-stat" key={label}><span>{label}</span><strong>{value}</strong>{index < 2 && data && <dl className="manager-payment-breakdown">
        <div><dt>Наличные</dt><dd>{money((index === 0 ? data.summary.cashTotal : data.summary.cashPaid) ?? 0)}</dd></div>
        <div><dt>Безналичные</dt><dd>{money((index === 0 ? data.summary.nonCashTotal : data.summary.nonCashPaid) ?? 0)}</dd></div>
        {(index === 0 ? data.summary.otherTotal : data.summary.otherPaid) > 0 && <div><dt>Бонусы / тип не указан</dt><dd>{money(index === 0 ? data.summary.otherTotal : data.summary.otherPaid)}</dd></div>}
      </dl>}</div>)}
    </div>
    <p className="manager-caption">Безналичный расчет — карта и СБП. Бонусы и заказы без типа оплаты показаны отдельно, если есть за выбранный период.</p>
    <section className="manager-panel">
      <div className="manager-heading mb-5"><h2>Позиции заказов</h2><div className="flex gap-2"><button className="manager-button" onClick={() => void report.refetch()} disabled={report.isFetching} aria-label="Обновить отчет"><RefreshCw size={17} /></button><button className="manager-button" onClick={() => void download()} disabled={exporting || !data?.count}><Download size={17} />{exporting ? 'Выгружаем…' : 'CSV за весь период'}</button></div></div>
      {exportError && <p role="alert" className="mb-4 text-red-700">{exportError}</p>}
      {report.isPending ? <p role="status">Формируем отчет…</p> : data?.rows.length ? <>
        <div className="manager-table-scroll"><table className="manager-table"><thead><tr>{['Заказ / время', 'Блюдо', 'Кол-во', 'Сумма позиции', 'Сумма заказа', 'Тип оплаты', 'Комментарий'].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.id}>
          <td><Link href={`/admin/orders/${row.orderId}`}>#{row.dailyNumber ?? row.orderId.slice(-6)}</Link><small>{date(row.createdAt)}</small><small>{ORDER_STATUS_LABELS[row.status]?.label ?? row.status}</small></td>
          <td><strong>{row.productName}</strong>{row.variantName && <small>{row.variantName}</small>}</td><td>{row.quantity}</td>
          <td className="manager-money">{money(row.unitPrice * row.quantity)}</td><td className="manager-money">{money(row.orderTotal)}</td>
          <td>{paymentLabels[row.paymentMethod ?? ''] ?? row.paymentMethod ?? 'Не указан'}<small>{row.paymentStatus === 'SUCCEEDED' ? 'Оплачено' : row.paymentStatus === 'CANCELLED' ? 'Отменено' : 'Ожидает оплаты'}</small></td><td>{row.comment || '—'}</td>
        </tr>)}</tbody></table></div>
        <div className="manager-pagination"><span>{data.count} позиций · страница {page} из {Math.ceil(data.count / 50)}</span><div className="flex gap-2"><button className="manager-button" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Назад</button><button className="manager-button" disabled={page * 50 >= data.count} onClick={() => setPage(p => p + 1)}>Далее</button></div></div>
      </> : !report.isError && <div className="manager-empty"><Receipt size={30} /><h2>За выбранный период заказов нет</h2><p>Измените даты или фильтры.</p></div>}
    </section>
  </div>;
}
