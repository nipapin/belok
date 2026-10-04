'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

export default function KitchenTimer({ seconds, storageKey }: { seconds: number; storageKey: string }) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    // Read saved deadline in the timer callback, including after a reload or mode switch.
    const tick = () => {
      let savedDeadline: number | null = deadline;
      try { savedDeadline ??= Number(localStorage.getItem(storageKey)) || null; } catch { /* Storage unavailable. */ }
      if (savedDeadline) {
        setDeadline(savedDeadline);
        setRemaining(Math.max(0, Math.ceil((savedDeadline - Date.now()) / 1000)));
      }
    };
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [deadline, storageKey]);
  return <div className="kitchen-timer">
    <Timer size={20} aria-hidden />
    <strong aria-live={remaining === 0 ? 'polite' : 'off'}>{remaining === 0 ? 'Время вышло' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</strong>
    <button type="button" className="kitchen-button secondary" onClick={() => {
      if (deadline) {
        try { localStorage.removeItem(storageKey); } catch { /* Storage unavailable. */ }
        setDeadline(null); setRemaining(seconds);
      } else {
        const next = Date.now() + seconds * 1000;
        try { localStorage.setItem(storageKey, String(next)); } catch { /* Storage unavailable. */ }
        setDeadline(next); setRemaining(seconds);
      }
    }}>{deadline ? 'Сбросить таймер' : 'Запустить таймер'}</button>
  </div>;
}
