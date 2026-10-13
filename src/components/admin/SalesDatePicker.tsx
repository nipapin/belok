'use client';

import { useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { revenueDays } from '@/lib/revenueStats';
import { clampSalesPeriod } from '@/lib/weather';
import './sales-date-picker.css';

const date = (day: string) => new Date(`${day}T12:00:00Z`);
const label = (day: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date(day));
const shiftMonth = (month: string, count: number) => { const d = date(`${month}-01`); d.setUTCMonth(d.getUTCMonth() + count); return d.toISOString().slice(0, 7); };

export default function SalesDatePicker({ from, to, firstDay, today, onApply }: {
  from: string; to: string; firstDay: string | null; today: string; onApply: (from: string, to: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [month, setMonth] = useState(from.slice(0, 7));
  const [mode, setMode] = useState<'day' | 'range'>(from === to ? 'day' : 'range');
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [choosingEnd, setChoosingEnd] = useState(false);
  const [hover, setHover] = useState('');
  function close() { dialog.current?.close(); trigger.current?.focus(); }
  function open() {
    setMonth(from.slice(0, 7)); setStart(from); setEnd(to); setMode(from === to ? 'day' : 'range');
    setChoosingEnd(false); setHover(''); dialog.current?.showModal();
  }
  function select(day: string) {
    if (mode === 'day') { setStart(day); setEnd(day); return; }
    if (!choosingEnd) { setStart(day); setEnd(day); setChoosingEnd(true); }
    else { setStart(day < start ? day : start); setEnd(day < start ? start : day); setChoosingEnd(false); setHover(''); }
  }
  function preset(days: number | null) {
    if (!firstDay) return;
    const d = date(today); if (days) d.setUTCDate(d.getUTCDate() - days + 1);
    const beginning = days ? d.toISOString().slice(0, 10) : firstDay;
    const range = clampSalesPeriod(beginning, today, firstDay, today);
    setStart(range.from); setEnd(range.to); setChoosingEnd(false); setMode(range.from === range.to ? 'day' : 'range'); setMonth(range.from.slice(0, 7));
  }
  const previewFrom = choosingEnd && hover && hover < start ? hover : start;
  const previewTo = choosingEnd && hover ? (hover < start ? start : hover) : end;
  function calendar(value: string, second: boolean) {
    const first = date(`${value}-01`);
    const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
    const blanks = (first.getUTCDay() + 6) % 7;
    const days = revenueDays(`${value}-01`, last.toISOString().slice(0, 10));
    return <section className={`sales-calendar ${second ? 'sales-calendar-second' : ''}`} key={value} aria-label={new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first)}>
      <h3>{new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first)}</h3>
      <div className="sales-calendar-grid"><div className="sales-weekdays">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <span key={day}>{day}</span>)}</div>
        {Array.from({ length: blanks }, (_, i) => <span key={`blank-${i}`} />)}
        {days.map(day => <button type="button" key={day} data-day={day}
          disabled={!firstDay || day < firstDay || day > today}
          aria-label={label(day)} aria-pressed={day === start || day === end} aria-current={day === today ? 'date' : undefined}
          className={`${day >= previewFrom && day <= previewTo ? 'is-range' : ''} ${day === previewFrom ? 'is-start' : ''} ${day === previewTo ? 'is-end' : ''}`}
          onMouseEnter={() => setHover(day)} onFocus={() => setHover(day)} onClick={() => select(day)}
          onKeyDown={event => {
            const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
            if (!(event.key in offsets)) return;
            event.preventDefault(); const target = date(day); target.setUTCDate(target.getUTCDate() + offsets[event.key]);
            const next = target.toISOString().slice(0, 10);
            if (!firstDay || next < firstDay || next > today) return;
            if (next.slice(0, 7) !== value) setMonth(next.slice(0, 7));
            requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());
          }}>{Number(day.slice(8))}</button>)}
      </div>
    </section>;
  }
  return <div className="sales-date-picker">
    <button type="button" ref={trigger} className="sales-date-trigger" aria-haspopup="dialog" onClick={open} disabled={!firstDay}>
      <CalendarDays size={20} aria-hidden="true" /><span><small>Период продаж</small><strong>{from === to ? label(from) : `${label(from)} — ${label(to)}`}</strong></span><ChevronRight size={18} aria-hidden="true" />
    </button>
    <dialog ref={dialog} className="sales-date-dialog" aria-labelledby="sales-date-title" onClick={event => { if (event.target === dialog.current) close(); }}>
      <div className="sales-date-header"><h2 id="sales-date-title">Выберите даты</h2><button type="button" onClick={close} aria-label="Закрыть календарь"><X size={20} /></button></div>
      <div className="sales-date-modes" role="group" aria-label="Режим выбора"><button type="button" aria-pressed={mode === 'day'} onClick={() => { setMode('day'); setEnd(start); setChoosingEnd(false); }}>Один день</button><button type="button" aria-pressed={mode === 'range'} onClick={() => { setMode('range'); setChoosingEnd(false); }}>Период</button></div>
      <div className="sales-date-presets">{([[1, 'Сегодня'], [7, '7 дней'], [30, '30 дней'], [null, 'Всё время']] as const).map(([days, text]) => <button type="button" key={text} onClick={() => preset(days)}>{text}</button>)}</div>
      <div className="sales-month-nav"><button type="button" disabled={!firstDay || month <= firstDay.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц"><ChevronLeft size={20} /></button><span>{mode === 'day' ? 'Выберите один день' : choosingEnd ? 'Теперь выберите конец периода' : 'Выберите начало периода'}</span><button type="button" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц"><ChevronRight size={20} /></button></div>
      <div className="sales-calendars" onMouseLeave={() => setHover('')}>{calendar(month, false)}{calendar(shiftMonth(month, 1), true)}</div>
      <p className="sales-date-hint">{firstDay ? `Данные доступны с первого заказа · ${label(firstDay)}` : 'Пока нет заказов'}</p>
      <div className="sales-date-footer"><span>{start === end ? label(start) : `${label(start)} — ${label(end)}`}</span><button type="button" className="btn-primary" onClick={() => { if (!firstDay) return; const range = clampSalesPeriod(start, end, firstDay, today); onApply(range.from, range.to); close(); }}>Показать</button></div>
    </dialog>
  </div>;
}
