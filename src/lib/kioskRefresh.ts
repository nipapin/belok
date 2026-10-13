export const KIOSK_CLIENT_STORAGE = 'belok:kiosk:client';
export const KIOSK_REFRESH_STORAGE = 'belok:kiosk:last-refresh';

function waitForWorker(worker:ServiceWorker, target:'installed'|'activated') {
  return new Promise<void>((resolve,reject)=>{
    const timer=window.setTimeout(()=>finish(new Error('Обновление ещё загружается')),15_000);
    const check=()=>{
      if(worker.state===target || worker.state==='activated') finish();
      else if(worker.state==='redundant') finish(new Error('Обновление не установлено'));
    };
    function finish(error?:Error) {
      window.clearTimeout(timer);worker.removeEventListener('statechange',check);
      if(error) reject(error);else resolve();
    }
    worker.addEventListener('statechange',check);check();
  });
}

export async function refreshKioskApplication(commandId:string,canRefresh:()=>boolean=()=>true) {
  // Check the network before clearing caches. Keep cookies, cart and payment storage.
  const url=new URL('/kiosk',window.location.origin);
  url.searchParams.set('_kiosk_refresh',commandId);
  const response=await fetch(url,{cache:'reload'});
  if(!response.ok) throw new Error('Нет связи с приложением');
  if(!canRefresh()) throw new Error('Киоск обслуживает заказ');
  if('serviceWorker' in navigator) {
    const registration=await navigator.serviceWorker.getRegistration();
    if(registration) {
      await registration.update();
      if(registration.installing) await waitForWorker(registration.installing,'installed');
      if(registration.waiting) {
        const waiting=registration.waiting;
        const activated=waitForWorker(waiting,'activated');
        waiting.postMessage({type:'SKIP_WAITING'});
        await activated;
      }
    }
  }
  if(!canRefresh()) throw new Error('Киоск обслуживает заказ');
  if('caches' in window) {
    for(const name of await window.caches.keys()) await window.caches.delete(name);
  }
  if(!canRefresh()) throw new Error('Киоск обслуживает заказ');
  localStorage.setItem(KIOSK_REFRESH_STORAGE,commandId);
  window.location.replace(url.toString());
}
