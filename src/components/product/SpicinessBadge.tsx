import { isSpicinessLevel, SPICINESS_LEVELS } from '@/lib/productSpiciness';

export function ChiliIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M16 7c-1-2 0-4 2-5" stroke="#15803d" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 6c-3 1-3 5-5 8-2 3-5 5-7 6 5 1 11-1 15-5 3-3 5-7 2-9-1-1-3-1-5 0Z" fill="#ef4444" />
      <path d="M14 9c-1 3-2 5-4 7" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SpicinessBadge({
  level,
  className = '',
}: {
  level?: number;
  className?: string;
}) {
  if (!isSpicinessLevel(level) || level === 0) return null;
  const label = `${SPICINESS_LEVELS[level].label}, острота ${level} из 3`;

  return (
    <span role="img" aria-label={label} title={label} className={`inline-flex shrink-0 items-center gap-0.5 ${className}`}>
      {Array.from({ length: level }, (_, index) => (
        <ChiliIcon key={index} className="size-5" />
      ))}
    </span>
  );
}
