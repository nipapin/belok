"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildVersion } from '@/lib/buildVersion';
import { canUpdateAutomatically, fetchApplicationVersion, updateApplication } from '@/lib/applicationUpdate';

export function useServiceWorkerUpdate({ autoUpdate = false }: { autoUpdate?: boolean } = {}) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  const applying = useRef(false);

  const applyUpdate = useCallback(async (automatic = false) => {
    if (applying.current) return;
    applying.current = true;
    setReloading(true);
    setError('');
    try {
      if (await updateApplication(automatic)) return;
    } catch (failure) {
      if (!automatic) setError(failure instanceof Error ? failure.message : 'Не удалось обновить приложение. Повторите.');
    }
    applying.current = false;
    setReloading(false);
  }, []);

  useEffect(() => {
    let stopped = false;
    let checking = false;
    let controlled = 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);
    const cleanups: Array<() => void> = [];
    const url = new URL(window.location.href);
    if (url.searchParams.get('_app_rev') === buildVersion.revision) {
      url.searchParams.delete('_app_rev');
      window.history.replaceState(window.history.state, '', url.toString());
    }
    async function check() {
      if (stopped || checking || applying.current || document.visibilityState !== 'visible' || !navigator.onLine) return;
      checking = true;
      try {
        const version = await fetchApplicationVersion();
        const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
        const changed = version.revision !== buildVersion.revision;
        if (changed && !stopped) setUpdateAvailable(true);
        await registration?.update();
        if (stopped) return;
        if (registration?.waiting && controlled) setUpdateAvailable(true);
        if (autoUpdate && (changed || registration?.waiting) && canUpdateAutomatically(version.revision)) await applyUpdate(true);
      } catch { /* Keep the current page usable offline and retry later. */ }
      finally { checking = false; }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));
    for (const name of ['focus', 'pageshow', 'online'] as const) {
      window.addEventListener(name, onVisible);
      cleanups.push(() => window.removeEventListener(name, onVisible));
    }
    if ('serviceWorker' in navigator) {
      const onControllerChange = () => {
        if (controlled && !stopped) { setUpdateAvailable(true); void check(); }
        controlled = true;
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      cleanups.push(() => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange));
      navigator.serviceWorker.ready.then(registration => {
        if (stopped) return;
        if (registration.waiting && controlled) setUpdateAvailable(true);
        const onUpdateFound = () => {
          const installing = registration.installing;
          if (!installing) return;
          const onStateChange = () => {
            if (installing.state === 'installed' && controlled && !stopped) { setUpdateAvailable(true); void check(); }
          };
          installing.addEventListener('statechange', onStateChange);
          cleanups.push(() => installing.removeEventListener('statechange', onStateChange));
        };
        registration.addEventListener('updatefound', onUpdateFound);
        cleanups.push(() => registration.removeEventListener('updatefound', onUpdateFound));
      }).catch(() => {});
    }
    const timer = window.setInterval(() => void check(), 60_000);
    cleanups.push(() => window.clearInterval(timer));
    void check();
    return () => { stopped = true; cleanups.forEach(cleanup => cleanup()); };
  }, [autoUpdate, applyUpdate]);

  return { updateAvailable, reloading, error, applyUpdate: () => applyUpdate(false), dismiss: () => setUpdateAvailable(false) };
}
