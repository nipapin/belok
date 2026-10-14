function waitForWorker(worker: ServiceWorker, target: 'installed' | 'activated') {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('Обновление ещё загружается. Попробуйте снова.')), 15_000);
    const check = () => {
      if (worker.state === target || worker.state === 'activated') finish();
      else if (worker.state === 'redundant') finish(new Error('Не удалось установить обновление. Попробуйте снова.'));
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

export async function updateAdminApplication() {
  // Keep the open page and any local data intact if the server is unavailable.
  const response = await fetch('/api/admin/version', { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить обновление. Попробуйте снова.');
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();
      if (registration.installing) await waitForWorker(registration.installing, 'installed');
      if (registration.waiting) {
        const waiting = registration.waiting;
        const activated = waitForWorker(waiting, 'activated');
        waiting.postMessage({ type: 'SKIP_WAITING' });
        await activated;
      }
    }
  }
  window.location.reload();
}
