export const inventoryKinds = ['RAW', 'PURCHASED', 'PREPARED', 'PACKAGING'] as const;
export type InventoryKind = (typeof inventoryKinds)[number];
export type InventoryUnit = 'g' | 'ml' | 'pcs';
export const inventoryKindLabels = {RAW: 'Сырьё', PURCHASED: 'Покупная продукция', PREPARED: 'Заготовка', PACKAGING: 'Упаковка'};
export const inventoryUnitLabels = {g: 'г', ml: 'мл', pcs: 'шт.'};
export const stockReasonLabels = {OPENING: 'Начальный остаток', RECEIPT: 'Приход', WRITE_OFF: 'Списание', RECOUNT: 'Инвентаризация'};
export type StockReason = keyof typeof stockReasonLabels;
export const MAX_STOCK_MILLI = 999999999000;

// Calculate in thousandths: decimal inputs must never be silently rounded.
export function stockMilli(value: unknown, unit: InventoryUnit): number {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('QUANTITY_INVALID');
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(text)) throw new Error('QUANTITY_INVALID');
  const [whole, fraction = ''] = text.split('.');
  const amount = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  if (!Number.isSafeInteger(amount) || amount > MAX_STOCK_MILLI || (unit === 'pcs' && amount % 1000 !== 0)) throw new Error('QUANTITY_INVALID');
  return amount;
}

export function stockDecimal(milli: number): string {
  const sign = milli < 0 ? '-' : '';
  const absolute = Math.abs(milli);
  const fraction = String(absolute % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${sign}${Math.floor(absolute / 1000)}${fraction ? '.' + fraction : ''}`;
}

export function stockNext(current: number, amount: number, reason: StockReason): number {
  if ((reason === 'RECEIPT' || reason === 'WRITE_OFF' || reason === 'OPENING') && amount <= 0) throw new Error('QUANTITY_POSITIVE');
  const next = reason === 'RECEIPT' ? current + amount : reason === 'WRITE_OFF' ? current - amount : amount;
  if (next < 0) throw new Error('STOCK_INSUFFICIENT');
  if (next > MAX_STOCK_MILLI) throw new Error('STOCK_LIMIT');
  return next;
}
