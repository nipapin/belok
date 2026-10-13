'use client';
import { useEffect, useRef, useState } from 'react';
import { buildVersion } from '@/lib/buildVersion';
import { KIOSK_CLIENT_STORAGE, KIOSK_REFRESH_STORAGE, refreshKioskApplication } from '@/lib/kioskRefresh';

export function useKioskControl(enabled:boolean,busy:boolean) {
  const busyRef=useRef(busy);
  useEffect(()=>{busyRef.current=busy},[busy]);
  const [refreshing,setRefreshing]=useState(false);
  useEffect(()=>{
    if(!enabled) return;
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    let running=false;
    const isBusy=()=>busyRef.current || Boolean(sessionStorage.getItem('belok:kiosk:payment') || sessionStorage.getItem('belok:kiosk:request'));
    async function check() {
      if(stopped || running) return;
      running=true;
      try {
        let id=localStorage.getItem(KIOSK_CLIENT_STORAGE);
        if(!id) {id=crypto.randomUUID();localStorage.setItem(KIOSK_CLIENT_STORAGE,id)}
        const lastRefreshId=localStorage.getItem(KIOSK_REFRESH_STORAGE);
        const response=await fetch('/api/kiosk/control',{method:'POST',cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({id,revision:buildVersion.revision,busy:isBusy(),lastRefreshId})});
        if(!response.ok) return;
        const {command}=await response.json() as {command:{id:string}|null};
        if(stopped || !command || command.id===lastRefreshId || isBusy()) return;
        setRefreshing(true);
        // Cover a checkout that started while the heartbeat request was in flight.
        if(isBusy()) {setRefreshing(false);return}
        await refreshKioskApplication(command.id,()=>!stopped && !isBusy());
      } catch {
        if(!stopped) setRefreshing(false);
        // Retain the unacknowledged command and retry after network recovery.
      } finally {
        running=false;
        if(!stopped) timer=setTimeout(check,15_000);
      }
    }
    void check();
    const onVisible=()=>{if(document.visibilityState==='visible'){clearTimeout(timer);void check()}};
    document.addEventListener('visibilitychange',onVisible);
    return ()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',onVisible)};
  },[enabled]);
  return refreshing;
}
