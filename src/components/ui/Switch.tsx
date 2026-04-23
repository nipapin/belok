'use client';

type SwitchProps = {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
};

/** Переключатель (iOS-style), для настроек в админке */
export default function Switch({ id, checked, onChange, disabled, 'aria-label': ariaLabel }: SwitchProps) {
  return (
    <label
      htmlFor={id}
      className={`relative inline-flex h-8 w-12 shrink-0 cursor-pointer items-center ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-checked={checked}
      />
      {/* h-8 w-12 (32×48): отступ 4px слева/справа + бегунок 24px → сдвиг 16px (translate-x-4) */}
      <span className="pointer-events-none absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--lg-text)_12%,transparent)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-(--lg-ring-strong) peer-checked:bg-[#18181b]" />
      <span
        className="pointer-events-none absolute left-1 top-1/2 h-6 w-6 -translate-y-1/2 translate-x-0 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out peer-checked:translate-x-4"
        aria-hidden
      />
    </label>
  );
}
