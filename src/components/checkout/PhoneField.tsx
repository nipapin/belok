'use client';

import { IMaskInput } from 'react-imask';

const inputClass =
  'w-full rounded-2xl border border-(--lg-ring) bg-(--lg-fill) px-4 py-3 text-sm text-(--lg-text) outline-none placeholder:text-(--lg-text-muted) focus:border-(--lg-ring-strong) focus:ring-2 focus:ring-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]';

export default function PhoneField({
  value,
  onChange,
  label = 'Телефон для связи',
  className = inputClass,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-(--lg-text)">{label}</span>
      <IMaskInput
        mask="+{7} (000) 000-00-00"
        value={value}
        unmask={false}
        lazy={false}
        inputMode="tel"
        autoComplete="tel"
        placeholder="+7 (900) 000-00-00"
        className={className}
        onAccept={(next) => onChange(String(next))}
      />
    </label>
  );
}
