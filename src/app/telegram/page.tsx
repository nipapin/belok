'use client';

import Script from 'next/script';
import Link from 'next/link';
import { Suspense, useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface TelegramApp {
  initData: string;
  ready(): void;
  expand(): void;
}
function TelegramEntry() {
  const params = useSearchParams();
  const [error, setError] = useState('');
  const busy = useRef(false);
  const login = useCallback(async () => {
    if (busy.current) return;
    const app = (window as Window & { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
    if (!app?.initData) { setError('Откройте меню через кнопку «Заказать» в нашем Telegram-боте.'); return; }
    busy.current = true;
    setError('');
    app.ready();
    app.expand();
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ initData: app.initData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось открыть меню');
      const order = params.get('order');
      // Full navigation avoids stale React Query/auth data from a previous identity.
      window.location.replace(order && /^[a-f0-9-]{36}$/i.test(order) ? `/orders/${order}` : '/menu');
    } catch (e) { setError(e instanceof Error ? e.message : 'Нет соединения. Попробуйте ещё раз.'); busy.current = false; }
  }, [params]);
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => { void login(); }}
      onError={() => setError('Не удалось подключиться к Telegram. Проверьте интернет и попробуйте ещё раз.')} />
    <h1 className="text-3xl font-bold">Белок 🥗</h1>
    <p role="status">{error || 'Открываем меню…'}</p>
    {error && <><button className="rounded-full bg-white/10 px-6 py-3" onClick={() => { window.location.reload(); }}>Попробовать снова</button>
      <a href="https://t.me/belok_chat_bot" className="underline">Перейти к боту</a>
      <Link href="/menu" className="underline">Открыть сайт</Link></>}
  </main>;
}
export default function TelegramPage() {
  return <Suspense fallback={<p>Открываем меню…</p>}><TelegramEntry /></Suspense>;
}
