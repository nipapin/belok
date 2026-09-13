'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * iOS Home Screen PWAs often ignore clients.openWindow / client.navigate on
 * notification tap. The service worker posts PUSH_NAVIGATE so the open page
 * can route to the order (or whatever path the push carried).
 */
export default function PushNavigateListener() {
  const router = useRouter();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const go = (url: unknown) => {
      if (typeof url !== 'string' || !url.startsWith('/')) return;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` === url) {
        return;
      }
      router.push(url);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NAVIGATE') go(event.data.url);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  return null;
}
