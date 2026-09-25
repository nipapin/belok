'use client';

import { useId, useMemo, useRef } from 'react';
import { useHaptic } from '@/hooks/useHaptic';

const DOTS = 13;
const THUMB_REM = 2.75;

type EffortSliderProps = {
  min?: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
};

export default function EffortSlider({
  min = 0,
  max,
  value,
  onChange,
  ariaLabel,
}: EffortSliderProps) {
  const id = useId();
  const haptic = useHaptic();
  const bucketRef = useRef(-1);
  const span = Math.max(1, max - min);
  const pct = Math.min(1, Math.max(0, (value - min) / span));

  const dots = useMemo(
    () =>
      Array.from({ length: DOTS }, (_, i) => {
        const t = i / (DOTS - 1);
        const dist = Math.abs(t - pct);
        const near = Math.max(0, 1 - dist * 2.8);
        const filled = t <= pct + 0.04;
        const bloom = near * pct;
        const size = 5 + bloom * 7;
        const opacity = filled ? 0.28 + near * 0.62 + pct * 0.12 : 0.16 + near * 0.22;
        return { t, size, opacity, glow: bloom };
      }),
    [pct]
  );

  const handleChange = (next: number) => {
    onChange(next);
    const bucket = Math.round(((next - min) / span) * 16);
    if (bucket !== bucketRef.current) {
      bucketRef.current = bucket;
      haptic('selection');
    }
  };

  return (
    <div
      className="effort-slider relative h-14 w-full select-none"
      style={{ '--effort': pct } as React.CSSProperties}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full bg-[#1c1c1e] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div
          className="effort-slider__bloom absolute top-1/2 size-28 rounded-full"
          style={{ left: `clamp(1.5rem, ${pct * 100}%, calc(100% - 1.5rem))` }}
        />
        <div className="absolute inset-x-5 inset-y-0 flex items-center justify-between">
          {dots.map((dot, i) => (
            <span
              key={i}
              className="effort-slider__dot rounded-full"
              style={{
                width: dot.size,
                height: dot.size,
                opacity: dot.opacity,
                boxShadow: dot.glow > 0.35 ? `0 0 ${10 + dot.glow * 14}px rgba(255,255,255,${0.25 + dot.glow * 0.4})` : 'none',
              }}
            />
          ))}
        </div>
        <div
          className="absolute top-1/2 z-[1] size-11 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
          style={{
            transform: 'translateY(-50%)',
            left: `clamp(6px, calc(${pct} * (100% - ${THUMB_REM}rem - 12px) + 6px), calc(100% - ${THUMB_REM}rem - 6px))`,
          }}
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="effort-slider__input absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none bg-transparent"
      />
    </div>
  );
}
