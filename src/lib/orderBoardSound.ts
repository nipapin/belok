'use client';

export type BoardSound = { name: string; data: ArrayBuffer };

function openSoundDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('belok-order-board', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadBoardSound(): Promise<BoardSound | undefined> {
  const db = await openSoundDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('settings').objectStore('settings').get('sound');
      request.onsuccess = () => resolve(request.result as BoardSound | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function saveBoardSound(sound: BoardSound | null): Promise<void> {
  const db = await openSoundDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      if (sound) tx.objectStore('settings').put(sound, 'sound');
      else tx.objectStore('settings').delete('sound');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function playBoardChime(context: AudioContext, buffer: AudioBuffer | null, volume: number): { duration: number; stop: () => void } {
  if (context.state !== 'running') throw new Error('Нажмите «Включить звук» ещё раз');
  const gain = context.createGain();
  gain.gain.value = volume;
  gain.connect(context.destination);
  if (buffer) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start();
    // A notification should not turn into a full song.
    const duration = Math.min(buffer.duration, 15);
    source.stop(context.currentTime + duration);
    return { duration, stop: () => { try { source.stop(); } catch { /* Already ended. */ } } };
  }
  const notes = [659.25, 830.61, 987.77, 830.61, 987.77];
  const oscillators: OscillatorNode[] = [];
  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * 0.18;
    const oscillator = context.createOscillator();
    oscillators.push(oscillator);
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.001, start);
    envelope.gain.exponentialRampToValueAtTime(0.3, start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    oscillator.connect(envelope);
    envelope.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + 0.32);
    oscillator.onended = () => {
      oscillator.disconnect(); envelope.disconnect();
      if (index === notes.length - 1) gain.disconnect();
    };
  });
  return { duration: (notes.length - 1) * 0.18 + 0.32, stop: () => oscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* Already ended. */ } }) };
}
