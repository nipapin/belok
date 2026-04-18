'use client';

import * as React from 'react';
import { OTPInput, OTPInputContext, type OTPInputProps } from 'input-otp';

export { REGEXP_ONLY_DIGITS, REGEXP_ONLY_CHARS, REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp';

function PinInputSlot({ index, className }: { index: number; className?: string }) {
  const ctx = React.useContext(OTPInputContext);
  const slot = ctx.slots[index];
  if (!slot) return null;

  return (
    <div
      className={[
        'relative flex h-12 min-w-11 flex-1 items-center justify-center rounded-2xl border border-(--lg-ring) bg-(--lg-fill) text-center text-lg font-semibold tabular-nums text-(--lg-text) backdrop-blur-sm transition-[border-color,box-shadow]',
        slot.isActive
          ? 'border-(--lg-ring-strong) shadow-[0_0_0_3px_color-mix(in_srgb,var(--lg-text)_10%,transparent)]'
          : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {slot.char !== null ? (
        slot.char
      ) : slot.placeholderChar ? (
        <span className="text-(--lg-text-muted) opacity-45">{slot.placeholderChar}</span>
      ) : null}
      {slot.hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-pulse bg-(--lg-text)" />
        </div>
      ) : null}
    </div>
  );
}

function PinInputLabel({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={['mb-3 block text-sm font-medium text-(--lg-text)', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </label>
  );
}

function PinInputDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={['mt-3 text-sm text-(--lg-text-muted)', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </p>
  );
}

function PinInputGroup({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={['flex w-full max-w-full items-center justify-center gap-2 sm:gap-3', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

const PinInputRoot = React.forwardRef<HTMLInputElement, OTPInputProps>(function PinInputRoot(props, ref) {
  return <OTPInput ref={ref} {...props} />;
});

export const PinInput = Object.assign(PinInputRoot, {
  Label: PinInputLabel,
  Group: PinInputGroup,
  Slot: PinInputSlot,
  Description: PinInputDescription,
});
