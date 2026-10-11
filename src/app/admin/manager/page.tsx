'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Warehouse, ClipboardList, Receipt, RefreshCw, ArrowUpRight } from 'lucide-react';
import { fetchAdminJson } from '@/lib/adminDashboard';
import './manager.css';

type Dish = { id: string; name: string; isCombo: boolean; state: 'AVAILABLE' | 'STOP' | 'UNCONFIGURED'; portions: number | null; reasons: string[] };
type Item = { id: string; quantity: string; minQuantity: string };
const states = { ALL: 'Все блюда', STOP: 'На стопе', AVAILABLE: 'Доступны', UNCONFIGURED: 'Без расчета' };
export default function ManagerPage() {
  const [state, setState] = useState<keyof typeof states>('STOP');
  const [search, setSearch] = useState('');
  const stock = useQuery({ queryKey: ['admin-inventory'], queryFn: () => fetchAdminJson<{ items: Item[] }>('/api/admin/inventory'), refetchInterval: 10000 });
  const availability = useQuery({ queryKey: ['inventory-availability'], queryFn: () => fetchAdminJson<{ dishes: Dish[]; updatedAt: string }>('/api/admin/inventory/availability'), refetchInterval: 10000 });
  const dishes = availability.data?.dishes ?? [];
  const items = stock.data?.items ?? [];
  const visible = dishes.filter(d => (state === 'ALL' || state === d.state) && d.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
  return <div className="manager-space manager-overview">
    <header className="manager-heading"><div><p className="dashboard-eyebrow">КАФЕ ПОД КОНТРОЛЕМ</p><h1>Управляющий</h1><p>Отчетность, текущие остатки и доступность блюд в одном месте.</p></div><button type="button" className="manager-button manager-refresh" aria-label="Обновить склад и стоп-лист" disabled={stock.isFetching || availability.isFetching} onClick={() => { void stock.refetch(); void availability.refetch(); }}><RefreshCw size={18} aria-hidden="true" /></button></header>
    <nav className="manager-links" aria-label="Рабочие разделы">{[
      { href: '/admin/reports', title: 'Отчетность', text: 'Произвольный период, блюда, оплата и комментарии', icon: BarChart3 },
      { href: '/admin/inventory', title: 'Склад', text: 'Все остатки, приход, списание и инвентаризация', icon: Warehouse },
      { href: '/admin/recipes', title: 'Техкарты', text: 'Состав и расход на блюдо или заготовку', icon: ClipboardList },
      { href: '/admin/orders', title: 'Заказы', text: 'Текущая очередь и управление приготовлением', icon: Receipt },
    ].map(({ icon: Icon, ...link }) => <Link key={link.href} href={link.href}><span className="manager-link-icon"><Icon size={24} aria-hidden="true" /></span><strong>{link.title}</strong><small>{link.text}</small></Link>)}</nav>
    <div className="manager-stats" aria-label="Показатели склада и меню">{[
      ['Позиций на складе', stock.data ? items.length : '—'],
      ['Нужно пополнить', stock.data ? items.filter(i => Number(i.quantity) <= Number(i.minQuantity)).length : '—'],
      ['Блюд на стопе', availability.data ? dishes.filter(d => d.state === 'STOP').length : '—'],
      ['Без расчета по ТТК', availability.data ? dishes.filter(d => d.state === 'UNCONFIGURED').length : '—'],
    ].map(([label, value]) => <div className="manager-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <section className="manager-panel">
      <div className="manager-heading manager-panel-heading mb-5"><div><h2>Доступность меню</h2><p className="mt-2">Обновление каждые 10 секунд по текущему складу.</p></div><Link className="manager-button" href="/admin/recipes">Техкарты <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
      <div className="manager-tools mb-5"><label><span>Состояние</span><select value={state} onChange={e => setState(e.target.value as keyof typeof states)}>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Поиск блюда</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Название блюда" /></label></div>
      {availability.isError || stock.isError ? <p role="alert" className="manager-note">Не удалось обновить склад или доступность. Нажмите кнопку обновления.{availability.data && ' Показаны последние загруженные данные.'}</p> : null}
      {availability.isPending ? <p role="status">Рассчитываем доступность…</p> : availability.data && <>
        {visible.map(dish => <Link className="manager-list-row" key={dish.id} href={dish.isCombo ? `/admin/combos/${dish.id}/edit` : `/admin/products/${dish.id}/edit`}>
          <span><strong>{dish.name}</strong><small>{dish.reasons.join(' · ') || (dish.portions === null ? 'Состав комбо доступен' : `Можно приготовить: ${dish.portions} порций`)}</small></span><span className={`manager-badge ${dish.state.toLowerCase()}`}>{states[dish.state]}</span><ArrowUpRight size={17} aria-hidden="true" />
        </Link>)}
        {!visible.length && <div className="manager-empty"><ClipboardList size={30} /><h2>{state === 'STOP' ? 'Блюд на стопе нет' : 'Блюд по фильтру нет'}</h2><p>Выберите другое состояние или название.</p></div>}
      </>}
    </section>
    <p className="manager-note">Блюда без ТТК или складской привязки помечены «Без расчета». Заготовки учитываются по готовому остатку. Стоп-лист использует текущие остатки; автоматическое списание продаж и резервирование пока не подключены.</p>
  </div>;
}

