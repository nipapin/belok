export function formatVariantTitle(productName: string, variantName?: string | null): string {
  const variant = variantName?.trim();
  if (!variant) return productName;
  return `${productName} · ${variant}`;
}

export function variantCountLabel(count: number): string {
  const n = Math.abs(count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'вариант'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'варианта'
        : 'вариантов';
  return `${count} ${word}`;
}
