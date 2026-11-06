import { buildVersion } from '@/lib/buildVersion';

export const BEFORE_APP_UPDATE = 'belok:before-app-update';
const RELOAD_KEY = 'belok:pwa:last-reload';
export type ApplicationVersion = { revision: string; version: string; builtAt: string | null };

export async function fetchApplicationVersion(): Promise<ApplicationVersion> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`/api/app-version?_check=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Не удалось получить обновление. Проверьте связь и повторите.');
    const version = await response.json() as ApplicationVersion;
    if (typeof version.revision !== 'string' || !/^[a-f0-9]{40}$/i.test(version.revision)) {
      throw new Error('Сервер ещё готовит обновление. Попробуйте позже.');
    }
    return version;
  } finally { window.clearTimeout(timer); }
}

export function canUpdateAutomatically(revision: string): boolean {
  if (document.visibilityState !== 'visible' || !navigator.onLine) return false;
  if (!/^\/(?:menu(?:\/[^/]+)?|cart|orders)?\/?$/.test(window.location.pathname)) return false;
  if (document.querySelector('[data-app-update-blocked="true"],dialog[open]')) return false;
  if (Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog => dialog.getClientRects().length > 0)) return false;
  if (document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')) return false;
  try { return sessionStorage.getItem(RELOAD_KEY) !== `${buildVersion.revision}:${revision}`; }
  catch { return false; }
}

function waitForWorker(worker: ServiceWorker, activated = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('Обновление ещё загружается. Попробуйте снова.')), 15_000);
    const check = () => {
      if (worker.state === 'activated' || (!activated && ['installed', 'activating'].includes(worker.state))) finish();
      else if (worker.state === 'redundant') finish(new Error('Не удалось загрузить новую версию. Повторите обновление.'));
    };
    function finish(error?: Error) {
      window.clearTimeout(timer);
      worker.removeEventListener('statechange', check);
      if (error) reject(error); else resolve();
    }
    worker.addEventListener('statechange', check);
    check();
  });
}

export async function updateApplication(automatic = false): Promise<boolean> {
  const pathname = window.location.pathname;
  const version = await fetchApplicationVersion();
  if (automatic && !canUpdateAutomatically(version.revision)) return false;
  if (document.querySelector('[data-app-update-blocked="true"]')) throw new Error('Дождитесь завершения оформления заказа.');
  if ('serviceWorker' in navigator) {
    let registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const script = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
      if (script && registration.updateViaCache !== 'none') {
        registration = await navigator.serviceWorker.register(script, { scope: registration.scope, updateViaCache: 'none' });
      }
      await registration.update();
      const installing = registration.installing;
      if (installing) await waitForWorker(installing);
      if (registration.waiting) {
        const waiting = registration.waiting;
        const activated = waitForWorker(waiting, true);
        waiting.postMessage({ type: 'SKIP_WAITING' });
        await activated;
      } else if (installing && installing.state !== 'activated') await waitForWorker(installing, true);
    }
  }
  if (window.location.pathname !== pathname || document.querySelector('[data-app-update-blocked="true"]')) return false;
  if (automatic && !canUpdateAutomatically(version.revision)) return false;
  if (!window.dispatchEvent(new Event(BEFORE_APP_UPDATE, { cancelable: true }))) {
    throw new Error('Не удалось сохранить форму. Завершите заказ перед обновлением.');
  }
  try { sessionStorage.setItem(RELOAD_KEY, `${buildVersion.revision}:${version.revision}`); }
  catch { if (automatic) return false; }
  const url = new URL(window.location.href);
  url.searchParams.set('_app_rev', version.revision);
  window.location.replace(url.toString());
  return true;
}

export async function refreshApplicationIfUpdated(): Promise<boolean> {
  const version = await fetchApplicationVersion();
  return version.revision !== buildVersion.revision ? updateApplication() : false;
}
