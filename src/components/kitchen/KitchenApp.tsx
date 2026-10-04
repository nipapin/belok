'use client';
/* eslint-disable @next/next/no-img-element -- Uploaded step photos use local or external storage. */

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChefHat, Search, Settings, ListOrdered } from 'lucide-react';
import { kitchenRequest, type KitchenCard } from '@/lib/kitchen';
import KitchenIngredients from './KitchenIngredients';
import KitchenTimer from './KitchenTimer';

type Session = { cardId: string; version: number; stage: number };
const progressKey = (id: string) => `belok-kitchen-progress:${id}`;

function readProgress(card: KitchenCard): Session {
  try {
    const value = JSON.parse(localStorage.getItem(progressKey(card.id)) || 'null');
    if (value?.version === card.version && Number.isInteger(value.stage) && value.stage >= 0 && value.stage <= card.steps.length + 1)
      return { cardId: card.id, version: card.version, stage: value.stage };
  } catch { /* Storage may be unavailable on a shared device. */ }
  return { cardId: card.id, version: card.version, stage: 0 };
}

export default function KitchenApp() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Все');
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<'steps' | 'full'>('steps');
  const contentRef = useRef<HTMLDivElement>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['kitchen-cards'],
    queryFn: () => kitchenRequest<{ cards: KitchenCard[] }>('/api/kitchen'),
    // A started run uses one recipe revision until the operator leaves it.
    refetchOnWindowFocus: false,
  });
  const cards = data?.cards ?? [];
  const card = cards.find(c => c.id === session?.cardId);
  const stage = session?.stage ?? 0;
  const step = card?.steps[stage - 1];
  const complete = !!card && stage > card.steps.length;

  function changeStage(next: number) {
    if (!card) return;
    if (next === 0 || (stage === 0 && next === 1)) {
      for (const s of card.steps) {
        try { localStorage.removeItem(`belok-kitchen-timer:${card.id}:${card.version}:${s.id}`); } catch { /* Storage unavailable. */ }
      }
    }
    const value = { cardId: card.id, version: card.version, stage: next };
    setSession(value);
    try { localStorage.setItem(progressKey(card.id), JSON.stringify(value)); } catch { /* Continue without storage. */ }
    contentRef.current?.scrollTo({ top: 0 });
  }

  const header = <header className="kitchen-header">
    <Link href="/kitchen" onClick={(e) => { e.preventDefault(); setSession(null); void refetch(); }} className="kitchen-brand"><ChefHat size={26} /> бело́к <span>кухня</span></Link>
    <Link href="/admin/kitchen" className="kitchen-admin"><Settings size={18} /> <span>Редактор карт</span></Link>
  </header>;

  if (isPending || error) return <div className="kitchen-app">{header}<main className="kitchen-catalog">
    <h1>{isPending ? 'Загружаем техкарты…' : 'Не удалось открыть кухню'}</h1>
    {error && <><p role="alert">{error.message}</p><button className="kitchen-button" onClick={() => void refetch()}>Попробовать снова</button></>}
  </main></div>;

  if (!card) {
    const categories = ['Все', ...new Set(cards.map(c => c.category))];
    const visible = cards.filter(c => (category === 'Все' || c.category === category) && `${c.title} ${c.category} ${c.sourceNumber}`.toLowerCase().includes(search.toLowerCase()));
    return <div className="kitchen-app">{header}<main className="kitchen-catalog">
      <p className="kitchen-eyebrow">Технологические карты</p>
      <h1>Готовим шаг за шагом</h1>
      <p className="kitchen-subtitle">Выберите блюдо. Подготовьте ингредиенты и следуйте инструкции — один шаг на экране.</p>
      <label className="kitchen-search"><Search size={20} /><input aria-label="Найти техкарту" placeholder="Название блюда или номер карты" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <div className="kitchen-categories" aria-label="Категории">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
      <p className="kitchen-count">{visible.length} техкарт</p>
      <div className="kitchen-card-grid">{visible.map(c => <button key={c.id} className="kitchen-recipe" onClick={() => { setSession(readProgress(c)); setMode('steps'); }}>
        <span className="kitchen-recipe-top"><span>{c.category}</span><span>№ {c.sourceNumber || '—'}</span></span>
        <h2>{c.title}</h2><span className="kitchen-recipe-bottom">{c.steps.length} шагов <ArrowRight size={20} /></span>
      </button>)}</div>
      {!visible.length && <p className="kitchen-empty">Техкарты не найдены. Измените поиск или категорию.</p>}
    </main></div>;
  }

  return <div className="kitchen-app kitchen-run">{header}
    <div className="kitchen-run-header">
      <button className="kitchen-back" onClick={() => { setSession(null); void refetch(); }}><ArrowLeft size={18} /> Все карты</button>
      <div className="kitchen-mode" aria-label="Режим просмотра">
        <button aria-pressed={mode === 'steps'} onClick={() => { setMode('steps'); contentRef.current?.scrollTo({ top: 0 }); }}><ListOrdered size={18} /> По шагам</button>
        <button aria-pressed={mode === 'full'} onClick={() => { setMode('full'); contentRef.current?.scrollTo({ top: 0 }); }}><BookOpen size={18} /> Вся карта</button>
      </div>
    </div>
    <div className="kitchen-run-content" ref={contentRef}>
      <div className="kitchen-run-inner">
        <p className="kitchen-eyebrow">Карта № {card.sourceNumber || '—'} · {card.category}</p>
        <h1 className="kitchen-dish-title">{card.title}</h1>
        {mode === 'full' ? <>
          <KitchenIngredients card={card} />
          <ol className="kitchen-full-steps">{card.steps.map((s, i) => <li key={s.id}>
            <span className="kitchen-eyebrow">Шаг {i + 1}</span><h2>{s.title}</h2><p>{s.text}</p>
            {s.imageUrl && <img src={s.imageUrl} alt={`Фото к шагу ${i+1}: ${s.title}`} className="kitchen-step-photo" />}
            {s.timerSeconds > 0 && <p className="kitchen-muted">Таймер · {s.timerSeconds} сек.</p>}
          </li>)}</ol>
        </> : complete ? <section className="kitchen-complete" aria-live="polite">
          <span className="kitchen-complete-icon"><Check size={40} /></span><h2>Приготовление завершено</h2>
          <p>Все {card.steps.length} шагов пройдены.</p>
          <button className="kitchen-button" onClick={() => changeStage(0)}>Начать заново</button>
        </section> : stage === 0 ? <section>
          <div className="kitchen-step-label">Перед началом</div><h2 className="kitchen-step-title">Подготовьте ингредиенты</h2>
          <KitchenIngredients card={card} />
        </section> : step ? <section className="kitchen-single-step" aria-live="polite">
          <div className="kitchen-step-label">Шаг {stage} из {card.steps.length}</div>
          <h2 className="kitchen-step-title">{step.title}</h2><p className="kitchen-step-text">{step.text}</p>
          {step.imageUrl && <img src={step.imageUrl} alt={`Фото к шагу ${stage}: ${step.title}`} className="kitchen-step-photo" />}
          {step.timerSeconds > 0 && <KitchenTimer key={step.id} seconds={step.timerSeconds} storageKey={`belok-kitchen-timer:${card.id}:${card.version}:${step.id}`} />}
        </section> : null}
      </div>
    </div>
    <footer className="kitchen-run-footer">
      {mode === 'full' ? <button className="kitchen-button" onClick={() => setMode('steps')}>Вернуться к шагам <ArrowRight size={20} /></button> : <>
        <div className="kitchen-progress"><div style={{ width: `${Math.min(stage, card.steps.length) / card.steps.length * 100}%` }} /></div>
        <div className="kitchen-actions">
          <button className="kitchen-button secondary" disabled={stage === 0} onClick={() => changeStage(stage - 1)}><ArrowLeft size={20} /> Назад</button>
          {complete ? <button className="kitchen-button" onClick={() => { setSession(null); void refetch(); }}>Все техкарты</button> :
            <button className="kitchen-button" onClick={() => changeStage(stage + 1)}>{stage === 0 ? 'Начать приготовление' : stage === card.steps.length ? 'Завершить приготовление' : 'Далее'} <ArrowRight size={20} /></button>}
        </div>
      </>}
    </footer>
  </div>;
}
