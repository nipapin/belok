/** Keep catalog/receipt rows while presenting toppings under their exact dish. */
export function orderItemGroups<T extends { id?: string; parentItemId?: string | null }>(items: T[]): { item: T; toppings: T[] }[] {
  const ids = new Set(items.map((item) => item.id));
  return items.filter((item) => !item.parentItemId || !ids.has(item.parentItemId)).map((item) => ({
    item, toppings: item.id ? items.filter((child) => child.parentItemId === item.id) : [],
  }));
}
