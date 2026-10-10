'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, ChefHat, Clock3, Expand, Loader2, LockKeyhole, Moon, Radio, Sun, Undo2, Volume2, VolumeX } from 'lucide-react';
import KioskPinPad from '@/components/kiosk/KioskPinPad';
import { fulfillmentLabel, orderTicket, paymentMethodLabel } from '@/lib/orderCustomer';
import type { BoardOrder } from '@/lib/orderBoard';
import { loadBoardSound, playBoardChime, saveBoardSound } from '@/lib/orderBoardSound';

const columns = [
  { id: 'new', title: 'Новые', statuses: ['PENDING'], icon: Bell },
  { id: 'cooking', title: 'Готовятся', statuses: ['CONFIRMED', 'PREPARING'], icon: ChefHat },
  { id: 'ready', title: 'Готовы', statuses: ['READY'], icon: CheckCheck },
];
const ACKNOWLEDGED_KEY = 'belok-board-acknowledged';
const THEME_KEY = 'belok-board-theme';
const REPEAT_SECONDS_KEY = 'belok-board-repeat-seconds';
const DEFAULT_REPEAT_SECONDS = 20;
const MIN_REPEAT_SECONDS = 5;
const MAX_REPEAT_SECONDS = 600;
function validRepeatSeconds(value: number) {
  return Number.isInteger(value) && value >= MIN_REPEAT_SECONDS && value <= MAX_REPEAT_SECONDS;
}
function loadRepeatSeconds() {
  try {
    if (typeof window !== 'undefined') {
      const saved = Number(window.localStorage.getItem(REPEAT_SECONDS_KEY));
      if (validRepeatSeconds(saved)) return saved;
    }
  } catch { /* Use the default interval when browser storage is unavailable. */ }
  return DEFAULT_REPEAT_SECONDS;
}
const actions = {
  PENDING: { label: 'Начать готовить', status: 'PREPARING' },
  CONFIRMED: { label: 'Начать готовить', status: 'PREPARING' },
  PREPARING: { label: 'Заказ готов', status: 'READY' },
  READY: { label: 'Выдан', status: 'COMPLETED' },
} as const;

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Kaliningrad', hour: '2-digit', minute: '2-digit' });
}

function OrderCard({ order, fresh, now, acknowledge, advance, markItem, busy }: { order: BoardOrder; fresh: boolean; now: number; acknowledge: () => void; advance: (status: 'PREPARING' | 'READY' | 'COMPLETED') => void; markItem: (item: BoardOrder['items'][number], action: 'prepare' | 'undo') => void; busy: boolean }) {
  const minutes = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60_000));
  const ageLabel = minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
  const action = order.status in actions ? actions[order.status as keyof typeof actions] : null;
  if (order.status === 'PENDING') return <article data-order-id={order.id} className={`board-card board-new-card ${fresh ? 'board-card-fresh' : ''}`}>
    <button className="board-order-action board-accept" type="button" disabled={busy} onClick={() => advance('PREPARING')}>
      <strong className="board-ticket">Заказ {orderTicket(order).replace('#', '№')}</strong>
      <span>{busy ? <Loader2 size={18} className="animate-spin" /> : 'Принять'}</span>
    </button>
  </article>;
  return (
    <article data-order-id={order.id} className={`board-card ${fresh ? 'board-card-fresh' : ''}`}>
      <div className="board-card-heading">
        <strong className="board-ticket">{orderTicket(order)}</strong>
        <span className={`board-age ${minutes >= 20 && order.status !== 'READY' ? 'board-age-late' : ''}`}><Clock3 size={16} />{ageLabel}</span>
      </div>
      <div className="board-tags"><span>{order.source === 'KIOSK' ? 'Касса' : 'Сайт'}</span><span>{fulfillmentLabel(order.fulfillment) ?? 'Самовывоз'}</span><span>{timeLabel(order.createdAt)}</span></div>
      <ul className="board-items">
        {order.items.map((item) => {
          const prepared = item.preparedQuantity ?? 0;
          const remaining = Math.max(0, item.quantity - prepared);
          return <li key={item.id} data-item-id={item.id} className={remaining === 0 ? 'board-item-done' : ''}>
            <div className="board-item-row">
              <button type="button" className="board-item" disabled={busy || remaining === 0} aria-label={`${item.name}: осталось ${remaining} из ${item.quantity}. Отметить одну порцию`} onClick={() => markItem(item, 'prepare')}>
                <strong>{item.name}</strong><strong className="board-quantity">{remaining ? `×${remaining}` : <Check size={24} aria-label="Готово" />}</strong>
              </button>
              {prepared > 0 && <button className="board-item-undo" type="button" disabled={busy} aria-label={`Вернуть одну порцию: ${item.name}`} title="Вернуть одну порцию" onClick={() => markItem(item, 'undo')}><Undo2 size={16} /></button>}
            </div>
            {item.customizations.map((c) => <p key={c.id} className={`board-customization ${c.action === 'REMOVE' ? 'board-remove' : 'board-add'}`}>{c.action === 'REMOVE' ? 'Без' : '+ Добавить'} {c.name}</p>)}
          </li>;
        })}
      </ul>
      {order.comment && <p className="board-comment">{order.comment}</p>}
      {order.fulfillment === 'DELIVERY' && <div className="board-delivery">
        {order.deliveryAddress && <p>{order.deliveryAddress}</p>}
        {order.deliveryTime && <p>Доставка: {order.deliveryTime === 'ASAP' ? 'как можно быстрее' : new Date(order.deliveryTime).toLocaleString('ru-RU', { timeZone: 'Europe/Kaliningrad', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
      </div>}
      <footer className="board-card-footer"><span>{order.total} ₽ · {order.paymentStatus === 'SUCCEEDED' ? 'Оплачен' : `К оплате · ${paymentMethodLabel(order.paymentMethod) ?? ''}`}</span>
        {fresh && <button onClick={acknowledge} type="button">Просмотрено ✓</button>}
      </footer>
      {action && <button className={`board-order-action board-order-action-${order.status.toLowerCase()}`} type="button" disabled={busy} onClick={() => advance(action.status)}>{busy ? <Loader2 size={18} className="animate-spin" /> : action.label}</button>}
    </article>
  );
}

export default function OrderBoard() {
  const [session, setSession] = useState<{ configured: boolean; unlocked: boolean } | null>(null);
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundName, setSoundName] = useState('Сигнал бело́к');
  const [volume, setVolume] = useState(0.8);
  const [repeatSeconds, setRepeatSeconds] = useState(loadRepeatSeconds);
  const [repeatInput, setRepeatInput] = useState(() => String(repeatSeconds));
  const [soundBusy, setSoundBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [completingAll, setCompletingAll] = useState(false);
  const bulkBusy = useRef(false);
  const updating = useRef(new Set<string>());
  const mutationRevision = useRef(0);
  const acknowledged = useRef(new Set<string>());
  const attention = useRef(new Set<string>());
  const newQueue = useRef(new Set<string>());
  const playback = useRef<{ until: number; stop: () => void; alarm: boolean } | null>(null);
  const repeatAfter = useRef(0);
  const refreshNow = useRef<() => void>(() => {});
  const seen = useRef<Set<string> | null>(null);
  const context = useRef<AudioContext | null>(null);
  const sound = useRef<AudioBuffer | null>(null);
  const soundData = useRef<ArrayBuffer | null>(null);
  const soundConfig = useRef({ enabled: false, volume: 0.8, repeatSeconds });

  const startSignal = useCallback((ctx: AudioContext, buffer: AudioBuffer | null, level: number, alarm: boolean) => {
    if (alarm && playback.current && Date.now() < playback.current.until) return;
    playback.current?.stop();
    const result = playBoardChime(ctx, buffer, level);
    const stop = () => {
      result.stop();
      if (playback.current?.stop === stop) playback.current = null;
    };
    playback.current = { until: Date.now() + result.duration * 1000, stop, alarm };
  }, []);

  const playNotification = useCallback(() => {
    if (!soundConfig.current.enabled || !context.current) return;
    try { startSignal(context.current, sound.current, soundConfig.current.volume, true); }
    catch {
      soundConfig.current.enabled = false;
      setSoundEnabled(false);
      setMessage('Браузер приостановил звук. Нажмите «Включить звук».');
    }
  }, [startSignal]);

  const checkSession = useCallback(async () => {
    try {
      try {
        const saved = JSON.parse(localStorage.getItem(ACKNOWLEDGED_KEY) || '[]') as unknown;
        if (Array.isArray(saved)) acknowledged.current = new Set(saved.filter((id): id is string => typeof id === 'string'));
      } catch { /* Audio still works when browser storage is unavailable. */ }
      const response = await fetch('/api/kiosk/session', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      try { setTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'); }
      catch { /* Keep the default theme when browser storage is unavailable. */ }
      setSession(await response.json()); setError('');
    } catch { setError('Не удалось проверить PIN. Проверьте соединение и повторите.'); }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(checkSession);
    void loadBoardSound().then((saved) => {
      if (saved) { soundData.current = saved.data; setSoundName(saved.name); }
    }).catch(() => setMessage('Не удалось загрузить сохранённый звук. Используется стандартный сигнал.'));
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(timer); playback.current?.stop(); void context.current?.close(); context.current = null; };
  }, [checkSession]);

  useEffect(() => {
    if (!session?.unlocked) return;
    const timer = window.setInterval(() => {
      if (newQueue.current.size && soundConfig.current.enabled && Date.now() >= repeatAfter.current) {
        playNotification(); repeatAfter.current = Date.now() + soundConfig.current.repeatSeconds * 1000;
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session?.unlocked, playNotification]);

  useEffect(() => {
    if (!session?.unlocked) return;
    let stopped = false;
    let timer: number | undefined;
    let loading = false;
    let controller: AbortController | null = null;
    async function refresh() {
      if (stopped || loading) return;
      const revision = mutationRevision.current;
      loading = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 12_000);
      try {
        const response = await fetch('/api/order-board', { cache: 'no-store', signal: controller.signal });
        if (stopped) return;
        if (response.status === 401) {
          stopped = true; seen.current = null; attention.current.clear(); newQueue.current.clear(); playback.current?.stop(); soundConfig.current.enabled = false; setSoundEnabled(false);
          setSession({ configured: true, unlocked: false }); setOrders([]); setFreshIds(new Set()); setLastSync(null);
          return;
        }
        if (!response.ok) throw new Error();
        const data = await response.json() as { orders: BoardOrder[] };
        if (stopped || revision !== mutationRevision.current || updating.current.size) return;
        const incoming = data.orders;
        const needsAttention = incoming.filter((order) => order.status === 'PENDING' && !acknowledged.current.has(order.id));
        const pending = incoming.filter((order) => order.status === 'PENDING');
        const queueWasEmpty = newQueue.current.size === 0;
        const firstLoad = seen.current === null;
        if (!seen.current) seen.current = new Set();
        incoming.forEach((order) => seen.current!.add(order.id));
        attention.current = new Set(needsAttention.map((order) => order.id));
        newQueue.current = new Set(pending.map((order) => order.id));
        setFreshIds(new Set(attention.current));
        setOrders(incoming); setLastSync(Date.now()); setError('');
        // New arrivals join one queue alarm. They never start extra sounds
        // while the queue is already waiting for staff.
        if (queueWasEmpty && pending.length && !firstLoad) { playNotification(); repeatAfter.current = Date.now() + soundConfig.current.repeatSeconds * 1000; }
        if (!pending.length && playback.current?.alarm) playback.current.stop();
      } catch {
        if (!stopped) setError('Нет связи с сервером. Показаны последние полученные заказы; повторяем подключение…');
      } finally {
        window.clearTimeout(timeout); loading = false;
        if (!stopped) timer = window.setTimeout(() => void refresh(), 3000);
      }
    }
    refreshNow.current = () => { window.clearTimeout(timer); void refresh(); };
    const onVisible = () => { if (!document.hidden) refreshNow.current(); };
    void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; controller?.abort(); window.clearTimeout(timer); refreshNow.current = () => {}; document.removeEventListener('visibilitychange', onVisible); };
  }, [session?.unlocked, playNotification]);

  async function enableSound() {
    try {
      if (!context.current || context.current.state === 'closed') context.current = new AudioContext();
      // Resume directly from the click, before loading/decoding a saved file.
      await context.current.resume();
      if (soundData.current && !sound.current) sound.current = await context.current.decodeAudioData(soundData.current.slice(0));
      startSignal(context.current, sound.current, volume, false);
      soundConfig.current.enabled = true; setSoundEnabled(true); setMessage('');
      repeatAfter.current = Date.now() + soundConfig.current.repeatSeconds * 1000;
    } catch { setMessage('Не удалось включить звук. Проверьте настройки браузера или выберите другой файл.'); }
  }

  async function chooseSound(file: File) {
    setSoundBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Выберите аудиофайл размером до 10 МБ');
      if (!context.current || context.current.state === 'closed') context.current = new AudioContext();
      await context.current.resume();
      const data = await file.arrayBuffer();
      const buffer = await context.current.decodeAudioData(data.slice(0));
      sound.current = buffer; soundData.current = data; setSoundName(file.name);
      startSignal(context.current, buffer, volume, false);
      soundConfig.current.enabled = true; setSoundEnabled(true);
      repeatAfter.current = Date.now() + soundConfig.current.repeatSeconds * 1000;
      try { await saveBoardSound({ name: file.name, data }); setMessage('Звук сохранён в этом браузере. Воспроизводятся первые 15 секунд.'); }
      catch { setMessage('Звук работает, но браузер не сохранил файл. После перезагрузки выберите его снова.'); }
    } catch (e) { setMessage(e instanceof Error && e.message.includes('10 МБ') ? e.message : 'Не удалось прочитать аудио. Выберите MP3, WAV или OGG.'); }
    finally { setSoundBusy(false); }
  }

  async function resetSound() {
    sound.current = null; soundData.current = null; setSoundName('Сигнал бело́к');
    try { await saveBoardSound(null); setMessage(''); }
    catch { setMessage('Не удалось удалить сохранённый файл из браузера.'); }
    playNotification();
  }

  function changeRepeatInterval(value: string) {
    setRepeatInput(value);
    const seconds = Number(value);
    if (!validRepeatSeconds(seconds) || seconds === soundConfig.current.repeatSeconds) return;
    soundConfig.current.repeatSeconds = seconds;
    setRepeatSeconds(seconds);
    // Apply immediately, starting a new countdown without an extra sound.
    repeatAfter.current = Date.now() + seconds * 1000;
    try { localStorage.setItem(REPEAT_SECONDS_KEY, String(seconds)); }
    catch { setMessage('Интервал изменён, но браузер не сохранил его. После перезагрузки установите его снова.'); }
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setMessage('Полноэкранный режим недоступен. Попробуйте F11 в браузере.'); }
  }

  async function lockScreen() {
    try {
      const response = await fetch('/api/order-board', { method: 'DELETE' });
      if (!response.ok) throw new Error();
      soundConfig.current.enabled = false; setSoundEnabled(false); seen.current = null; attention.current.clear(); newQueue.current.clear(); playback.current?.stop();
      setSession({ configured: true, unlocked: false }); setOrders([]); setFreshIds(new Set()); setLastSync(null);
    } catch { setMessage('Не удалось заблокировать экран. Проверьте соединение и повторите.'); }
  }

  function acknowledge(ids: string[]) {
    ids.forEach((id) => { acknowledged.current.add(id); attention.current.delete(id); });
    setFreshIds(new Set(attention.current));
    try { localStorage.setItem(ACKNOWLEDGED_KEY, JSON.stringify([...acknowledged.current].slice(-1000))); } catch { /* Keep acknowledgment for this session. */ }
  }

  async function advanceOrder(order: BoardOrder, status: 'PREPARING' | 'READY' | 'COMPLETED', silent = false): Promise<{ ok: boolean; message?: string }> {
    if (updating.current.has(order.id)) return { ok: false, message: 'Заказ ещё обновляется' };
    mutationRevision.current++;
    updating.current.add(order.id); setUpdatingIds(new Set(updating.current));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`/api/order-board/${order.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }), signal: controller.signal });
      const data = await response.json() as { error?: string; warning?: string };
      if (!response.ok) {
        if (response.status === 401) { attention.current.clear(); newQueue.current.clear(); playback.current?.stop(); soundConfig.current.enabled = false; setSoundEnabled(false); setSession({ configured: true, unlocked: false }); setOrders([]); }
        throw new Error(data.error || 'Не удалось изменить статус');
      }
      acknowledge([order.id]);
      newQueue.current.delete(order.id);
      if (!newQueue.current.size && playback.current?.alarm) playback.current.stop();
      setOrders((current) => status === 'COMPLETED' ? current.filter((item) => item.id !== order.id) : current.map((item) => item.id === order.id ? { ...item, status } : item));
      if (!silent) setMessage(data.warning || '');
      return { ok: true, message: data.warning };
    } catch (error) {
      const message = controller.signal.aborted ? 'Сервер не ответил вовремя. Проверяем текущий статус заказа…' : error instanceof Error ? error.message : 'Нет соединения. Проверяем статус заказа.';
      if (!silent) setMessage(message);
      return { ok: false, message };
    }
    finally { window.clearTimeout(timeout); mutationRevision.current++; updating.current.delete(order.id); setUpdatingIds(new Set(updating.current)); refreshNow.current(); }
  }

  async function markItem(order: BoardOrder, item: BoardOrder['items'][number], action: 'prepare' | 'undo') {
    if (bulkBusy.current || updating.current.has(order.id)) return;
    mutationRevision.current++;
    updating.current.add(order.id); setUpdatingIds(new Set(updating.current));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`/api/order-board/${order.id}/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, preparedQuantity: item.preparedQuantity ?? 0 }), signal: controller.signal,
      });
      const data = await response.json() as { item?: { id: string; preparedQuantity: number }; order?: { status: BoardOrder['status'] }; error?: string };
      if (!response.ok || !data.item || !data.order) {
        if (response.status === 401) { newQueue.current.clear(); playback.current?.stop(); soundConfig.current.enabled = false; setSoundEnabled(false); setSession({ configured: true, unlocked: false }); setOrders([]); }
        throw new Error(data.error || 'Не удалось отметить позицию');
      }
      const preparedQuantity = data.item.preparedQuantity;
      const status = data.order.status;
      setOrders((current) => current.map((entry) => entry.id === order.id ? { ...entry, status, items: entry.items.map((position) => position.id === item.id ? { ...position, preparedQuantity } : position) } : entry));
      setMessage('');
    } catch (error) {
      setMessage(controller.signal.aborted ? 'Сервер не ответил вовремя. Проверяем отметку позиции…' : error instanceof Error ? error.message : 'Не удалось отметить позицию');
    } finally { window.clearTimeout(timeout); mutationRevision.current++; updating.current.delete(order.id); setUpdatingIds(new Set(updating.current)); refreshNow.current(); }
  }

  async function completeAllReady() {
    if (bulkBusy.current || updating.current.size) return;
    const ready = orders.filter((order) => order.status === 'READY');
    if (!ready.length) return;
    bulkBusy.current = true; setCompletingAll(true);
    let completed = 0;
    const warnings = new Set<string>();
    try {
      // Use the regular transition so payment checks, bonuses and customer
      // notifications work exactly as with the individual "Выдан" button.
      for (const order of ready) {
        const result = await advanceOrder(order, 'COMPLETED', true);
        if (result.ok) completed++;
        if (result.message) warnings.add(result.message);
      }
      setMessage(completed !== ready.length || warnings.size ? `Выдано заказов: ${completed} из ${ready.length}.${warnings.size ? ` ${[...warnings].join(' ')}` : ''}` : '');
    } finally { bulkBusy.current = false; setCompletingAll(false); refreshNow.current(); }
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); }
    catch { /* The theme still works for the current session. */ }
  }

  if (!session || !session.unlocked) return <main className="order-board board-login" data-theme={theme}>
    <div className="board-brand">бело́к</div>
    {session ? <KioskPinPad configured={session.configured} title="Экран заказов" description="Введите тот же PIN, что и на кассе" onUnlocked={() => void checkSession()} /> : <div className="board-loading"><Loader2 className="animate-spin" /> Проверяем доступ…</div>}
    {error && <div className="board-notice board-notice-error">{error}<button onClick={() => void checkSession()}>Повторить</button></div>}
  </main>;

  return <main className="order-board" data-theme={theme} aria-label="Экран заказов">
    <header className="board-header">
      <div className="board-brand">бело́к</div>
      <div className={`board-connection ${error || (lastSync && now - lastSync > 15000) ? 'board-disconnected' : ''}`}><Radio size={17} />{error ? 'Нет соединения' : lastSync ? 'На связи' : 'Подключаемся'}<small>{lastSync ? `Обновлено ${timeLabel(new Date(lastSync).toISOString())}` : 'Получаем заказы'}</small></div>
      <div className="board-controls">
        <button className={soundEnabled ? 'board-sound-active' : 'board-sound-off'} onClick={() => {
          if (soundEnabled) { soundConfig.current.enabled = false; setSoundEnabled(false); playback.current?.stop(); }
          else void enableSound();
        }}>{soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{soundEnabled ? 'Звук включён' : 'Включить звук'}</button>
        <button onClick={() => setSettingsOpen(!settingsOpen)}>Настройки звука</button>
        <button onClick={toggleTheme} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        <button onClick={() => void fullscreen()} title="Полный экран" aria-label="Полный экран"><Expand size={16} /></button>
        <button onClick={() => void lockScreen()} title="Заблокировать экран" aria-label="Заблокировать экран"><LockKeyhole size={16} /></button>
      </div>
      <time className="board-clock" suppressHydrationWarning>{timeLabel(new Date(now).toISOString())}</time>
    </header>
    {settingsOpen && <section className="board-settings" aria-label="Настройки звука">
      <div><strong>Сигнал нового заказа</strong><p>{soundName}</p></div>
      <label className="board-file-button">{soundBusy ? 'Загружаем…' : 'Выбрать свой звук'}<input type="file" accept="audio/*,.mp3,.wav,.ogg" disabled={soundBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseSound(file); event.target.value = ''; }} /></label>
      <button onClick={() => void enableSound()}>Проверить звук</button><button onClick={() => void resetSound()}>Стандартный</button>
      <label className="board-volume">Громкость {Math.round(volume * 100)}%<input aria-label="Громкость" type="range" min="0.1" max="1" step="0.1" value={volume} onChange={(event) => { const value = Number(event.target.value); soundConfig.current.volume = value; setVolume(value); }} /></label>
      <div><label className="board-repeat">Повтор каждые <input aria-label="Период повтора в секундах" type="number" min={MIN_REPEAT_SECONDS} max={MAX_REPEAT_SECONDS} step="1" value={repeatInput} onChange={(event) => changeRepeatInterval(event.target.value)} onBlur={() => setRepeatInput(String(repeatSeconds))} /> сек.</label><p>От 5 до 600 секунд · сохраняется автоматически</p></div>
    </section>}
    {!soundEnabled && <div className="board-notice"><VolumeX size={19} />Нажмите «Включить звук», чтобы слышать новые заказы. После перезагрузки включите его снова.</div>}
    {message && <div className="board-notice" role="status">{message}<button onClick={() => setMessage('')}>Закрыть</button></div>}
    {error && <div className="board-notice board-notice-error" role="alert">{error}</div>}
    <div className="board-columns">
      {columns.map((column) => {
        const group = orders.filter((order) => column.statuses.includes(order.status))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            || (b.dailyNumber ?? 0) - (a.dailyNumber ?? 0) || b.id.localeCompare(a.id));
        const Icon = column.icon;
        return <section key={column.id} className={`board-column board-column-${column.id}`}>
          <div className="board-column-heading"><Icon size={19} /><h2>{column.title}</h2>
            {column.id === 'ready' && <button className="board-complete-all" type="button" title="Отметить все готовые заказы выданными" aria-label="Выдать все готовые заказы" disabled={!group.length || completingAll || updatingIds.size > 0} onClick={() => void completeAllReady()}>{completingAll ? <Loader2 size={18} className="animate-spin" /> : <CheckCheck size={18} />}</button>}
            <strong>{group.length}</strong></div>
          <div className="board-column-scroll">
            {group.map((order) => <OrderCard key={order.id} order={order} fresh={freshIds.has(order.id)} now={now} acknowledge={() => acknowledge([order.id])} advance={(status) => { if (!bulkBusy.current) void advanceOrder(order, status); }} markItem={(item, action) => void markItem(order, item, action)} busy={updatingIds.has(order.id) || completingAll} />)}
            {!group.length && <div className="board-empty"><Icon size={34} /><p>{lastSync ? 'Пока нет заказов' : 'Загружаем заказы…'}</p></div>}
          </div>
        </section>;
      })}
    </div>
  </main>;
}
