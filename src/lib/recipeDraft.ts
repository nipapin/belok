export type RecipeDraft = {
  outputQuantity: string;
  outputUnit: 'g' | 'ml' | 'pcs';
  instructions: string;
  lines: {itemId: string; quantity: string}[];
};
export type StoredRecipeDraft = {version: 1; updatedAt: number; draft: RecipeDraft};
export function parseRecipeDraft(raw: string | null): StoredRecipeDraft | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    const d = value?.draft;
    if (value?.version !== 1 || !Number.isFinite(value.updatedAt) || !d ||
      typeof d.outputQuantity !== 'string' || d.outputQuantity.length > 32 ||
      !['g', 'ml', 'pcs'].includes(d.outputUnit) || typeof d.instructions !== 'string' ||
      d.instructions.length > 15000 || !Array.isArray(d.lines) || d.lines.length > 100 ||
      d.lines.some((line: RecipeDraft['lines'][number]) => !line || typeof line.itemId !== 'string' ||
        !line.itemId || typeof line.quantity !== 'string' || line.quantity.length > 32) ||
      new Set(d.lines.map((line: RecipeDraft['lines'][number]) => line.itemId)).size !== d.lines.length) return null;
    return value;
  } catch { return null; }
}
export function recipeDraftInput(draft: RecipeDraft) {
  const number = (value: string) => {
    if (!/^\d{1,9}(?:[.,]\d{1,3})?$/.test(value.trim())) throw Error('Укажите положительные количества с точностью до трёх знаков.');
    const n = Number(value.trim().replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > 999999999) throw Error('Количество должно быть больше нуля.');
    return n;
  };
  if (!draft.lines.length) throw Error('Добавьте хотя бы один компонент.');
  return {
    outputQuantity: number(draft.outputQuantity), outputUnit: draft.outputUnit, instructions: draft.instructions,
    lines: draft.lines.map(line => ({itemId: line.itemId, quantity: number(line.quantity)})),
  };
}
