'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Loader2 } from 'lucide-react';

interface QrScannerProps {
  onScan: (value: string) => void;
  paused?: boolean;
}

interface NativeBarcodeDetector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

export default function QrScanner({ onScan, paused = false }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<NativeBarcodeDetector | null>(null);
  const [error, setError] = useState<string>('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Камера недоступна в этом браузере');
          setStarting(false);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play().catch(() => {});

        if (typeof window !== 'undefined' && window.BarcodeDetector) {
          try {
            detectorRef.current = new window.BarcodeDetector({
              formats: ['qr_code'],
            });
          } catch {
            detectorRef.current = null;
          }
        }

        canvasRef.current = document.createElement('canvas');
        setStarting(false);
        loop();
      } catch (e) {
        const err = e as { name?: string; message?: string };
        if (err.name === 'NotAllowedError') {
          setError('Доступ к камере запрещён. Разрешите доступ в настройках браузера.');
        } else if (err.name === 'NotFoundError') {
          setError('Камера не найдена');
        } else {
          setError(err.message || 'Не удалось включить камеру');
        }
        setStarting(false);
      }
    }

    async function loop() {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (paused || !video || !canvas || video.readyState < 2) {
        rafRef.current = window.requestAnimationFrame(loop);
        return;
      }

      try {
        if (detectorRef.current) {
          const results = await detectorRef.current.detect(video);
          if (results && results.length > 0 && results[0]?.rawValue) {
            onScan(results[0].rawValue);
            return;
          }
        } else {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w > 0 && h > 0) {
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, w, h);
              const imgData = ctx.getImageData(0, 0, w, h);
              const code = jsQR(imgData.data, w, h, {
                inversionAttempts: 'dontInvert',
              });
              if (code && code.data) {
                onScan(code.data);
                return;
              }
            }
          }
        }
      } catch {
        /* keep scanning */
      }

      rafRef.current = window.requestAnimationFrame(loop);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [onScan, paused]);

  return (
    <div className="qr-scanner-frame relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        className="size-full object-cover"
      />
      {(starting || error) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 p-6 text-center text-sm text-white">
          {error ? (
            <>
              <Camera className="size-6 opacity-80" strokeWidth={1.75} />
              <p className="max-w-[20rem]">{error}</p>
            </>
          ) : (
            <>
              <Loader2 className="size-6 animate-spin" strokeWidth={1.75} />
              <p>Включаем камеру…</p>
            </>
          )}
        </div>
      )}
      {!error && !starting && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 size-[68%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      )}
    </div>
  );
}
