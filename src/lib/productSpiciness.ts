export const SPICINESS_LEVELS = [
  { value: 0, label: 'Не остро' },
  { value: 1, label: 'Слегка остро' },
  { value: 2, label: 'Остро' },
  { value: 3, label: 'Очень остро' },
] as const;

export function isSpicinessLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}
