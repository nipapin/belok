export type ReorderItem = { id: string; sortOrder: number };

export function parseReorderItems(raw: unknown): ReorderItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) return null;
  const items: ReorderItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const id = typeof (entry as { id?: unknown }).id === 'string'
      ? (entry as { id: string }).id.trim()
      : '';
    if (!id || id.length > 64 || seen.has(id)) return null;
    const sortRaw = (entry as { sortOrder?: unknown }).sortOrder;
    const sortOrder = typeof sortRaw === 'number' ? sortRaw : Number(sortRaw);
    if (!Number.isFinite(sortOrder)) return null;
    seen.add(id);
    items.push({ id, sortOrder: Math.round(sortOrder) });
  }
  return items;
}
