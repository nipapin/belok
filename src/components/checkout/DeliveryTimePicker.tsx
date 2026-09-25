'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Clock } from 'lucide-react';

export const ASAP_TIME = 'ASAP';

const FIRST_MINUTE = 10 * 60;
const LAST_MINUTE = 21 * 60;

type TimeSlot = { time: string; available: boolean };

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildTodaySlots(now = new Date()): TimeSlot[] {
  const earliest = now.getTime() + 45 * 60_000;
  const slots: TimeSlot[] = [];
  for (let minutes = FIRST_MINUTE; minutes <= LAST_MINUTE; minutes += 30) {
    const slot = new Date(now);
    slot.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    slots.push({
      time: `${pad(slot.getHours())}:${pad(slot.getMinutes())}`,
      available: slot.getTime() >= earliest,
    });
  }
  return slots;
}

export function deliveryTimeLabel(value: string): string {
  if (!value || value === ASAP_TIME) return 'Как можно быстрее';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export default function DeliveryTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const slots = useMemo(() => buildTodaySlots(), []);
  const [scheduled, setScheduled] = useState(() => Boolean(value && value !== ASAP_TIME));
  const selectedDate = value && value !== ASAP_TIME && !Number.isNaN(new Date(value).getTime()) ? new Date(value) : null;
  const selectedTime = selectedDate
    ? `${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')}`
    : '';
  const selectedSlot = slots.find((slot) => slot.time === selectedTime && slot.available);

  const pickTime = (time: string) => {
    const slot = slots.find((item) => item.time === time);
    if (!slot?.available) return;
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(today);
    next.setHours(hours, minutes, 0, 0);
    onChange(next.toISOString());
  };

  const pickScheduled = () => {
    setScheduled(true);
    if (selectedSlot) return;
    const next = slots.find((slot) => slot.available);
    if (next) pickTime(next.time);
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-(--lg-text)">Время</span>
      <div className="grid grid-cols-2 items-stretch gap-2">
        <button
          type="button"
          className={`${!scheduled ? 'btn-primary' : 'btn-outline'} h-full w-full flex-col !rounded-[calc(1.75rem/1.618)] py-3.5 text-center text-sm leading-tight`}
          onClick={() => {
            setScheduled(false);
            onChange(ASAP_TIME);
          }}
        >
          <Clock className="size-5" strokeWidth={1.75} />
          Как можно быстрее
        </button>
        <button
          type="button"
          className={`${scheduled ? 'btn-primary' : 'btn-outline'} h-full w-full flex-col !rounded-[calc(1.75rem/1.618)] py-3.5 text-center text-sm leading-tight`}
          onClick={pickScheduled}
        >
          <CalendarClock className="size-5" strokeWidth={1.75} />
          Ко времени
        </button>
      </div>
      {scheduled && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {slots.map((slot) => (
            <button
              key={slot.time}
              type="button"
              disabled={!slot.available}
              className={
                selectedSlot?.time === slot.time
                  ? 'btn-primary px-0 py-2 text-xs'
                  : 'btn-outline px-0 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40'
              }
              onClick={() => pickTime(slot.time)}
            >
              {slot.time}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
