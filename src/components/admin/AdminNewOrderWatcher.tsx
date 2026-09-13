'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import type { NotificationSettings } from '@/lib/notificationSettings';

const STORAGE_KEY = 'admin-last-seen-order-id';

function playNewOrderBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    /* ignore autoplay / AudioContext errors */
  }
}

export default function AdminNewOrderWatcher() {
  const router = useRouter();
  const primed = useRef(false);
  const [toast, setToast] = useState<string | null>(null);

  const { data: settingsData } = useQuery({
    queryKey: ['admin-notification-settings'],
    queryFn: () => fetch('/api/admin/notification-settings').then((r) => r.json()),
  });
  const soundOn = (settingsData?.settings as NotificationSettings | undefined)?.adminNewOrdersSound !== false;

  const { data } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => fetch('/api/admin/orders').then((r) => r.json()),
    refetchInterval: 10_000,
  });

  const latestId = (data?.orders as { id: string }[] | undefined)?.[0]?.id ?? null;

  useEffect(() => {
    if (!latestId) return;
    const prev = sessionStorage.getItem(STORAGE_KEY);
    if (!primed.current) {
      primed.current = true;
      if (!prev) {
        sessionStorage.setItem(STORAGE_KEY, latestId);
        return;
      }
      if (prev === latestId) return;
    } else if (prev === latestId) {
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, latestId);

    if (!soundOn) return;
    const orders = (data?.orders as { id: string }[] | undefined) ?? [];
    let count = 0;
    for (const order of orders) {
      if (order.id === prev) break;
      count += 1;
    }
    const label = count > 1 ? `${count} новых заказа` : 'Новый заказ';
    const timer = window.setTimeout(() => {
      setToast(label);
      playNewOrderBeep();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [latestId, soundOn, data?.orders]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setToast(null);
        router.push(latestId ? `/admin/orders/${latestId}` : '/admin/orders');
      }}
      className="fixed right-3 top-[calc(var(--admin-nav-h)+0.75rem)] z-[1400] flex max-w-[min(100%-1.5rem,22rem)] items-center gap-2 rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-3 py-2.5 text-left text-sm font-semibold text-(--lg-text) shadow-(--lg-shadow) md:right-8"
    >
      <Bell className="size-4 shrink-0" strokeWidth={2} />
      {toast}
    </button>
  );
}
