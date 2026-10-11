export type StockRequirement = {
  itemId: string; name: string; unit: string; required: string | null;
  quantity: string; active: boolean;
};
export type StockAvailability = { state: 'AVAILABLE' | 'STOP' | 'UNCONFIGURED'; portions: number | null; reasons: string[] };

/** Prepared ingredients are consumed from their own stock, not from hypothetical future production. */
export function calculateAvailability(lines: StockRequirement[]): StockAvailability {
  if (!lines.length || lines.some(line => line.required === null)) return { state: 'UNCONFIGURED', portions: null, reasons: ['Не задан расход на одну порцию'] };
  const totals = new Map<string, { line: StockRequirement; required: number }>();
  for (const line of lines) {
    const required = Number(line.required);
    if (!Number.isFinite(required) || required <= 0) return { state: 'UNCONFIGURED', portions: null, reasons: ['Некорректная норма ТТК'] };
    const previous = totals.get(line.itemId);
    totals.set(line.itemId, { line, required: (previous?.required ?? 0) + required });
  }
  let portions = Number.MAX_SAFE_INTEGER;
  const reasons: string[] = [];
  for (const { line, required } of totals.values()) {
    // Stock is stored with 3 decimal places. Round consumption up, never overstate availability.
    const need = Math.ceil(Number((required * 1000).toFixed(6)));
    const stock = Math.round(Number(line.quantity) * 1000);
    const count = line.active && Number.isFinite(stock) ? Math.max(0, Math.floor(stock / need)) : 0;
    portions = Math.min(portions, count);
    if (!count) reasons.push(line.active ? `Не хватает: ${line.name}` : `Позиция архивирована: ${line.name}`);
  }
  return { state: portions > 0 ? 'AVAILABLE' : 'STOP', portions, reasons };
}

export function cartStockAvailability(requests: { productId: string; quantity: number }[], requirements: Map<string, StockRequirement[]>): StockAvailability {
  const lines: StockRequirement[] = [];
  for (const request of requests) {
    const recipe = requirements.get(request.productId) ?? [];
    if (!recipe.length || recipe.some(line => line.required === null)) continue;
    for (const line of recipe) lines.push({ ...line, required: String(Math.ceil(Number((Number(line.required) * 1000).toFixed(6))) * request.quantity / 1000) });
  }
  return calculateAvailability(lines);
}
