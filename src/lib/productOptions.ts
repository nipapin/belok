export const VARIANT_NUMBER_FIELDS = ['price', 'calories', 'proteins', 'fats', 'carbs', 'fiber', 'weightGrams', 'volumeMl'] as const;
export type VariantNumberField = (typeof VARIANT_NUMBER_FIELDS)[number];
export type VariantValues = Partial<Record<VariantNumberField, number | null>>;

/** Null inherits the parent value; zero is a real override. */
export function resolveVariant<T extends VariantValues>(product: T, variant?: VariantValues | null): T {
  const result = { ...product };
  for (const field of VARIANT_NUMBER_FIELDS) {
    if (variant?.[field] != null) Object.assign(result, { [field]: variant[field] });
  }
  return result;
}

export interface OptionLink {
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
  optionGroup?: string | null;
  ingredient: { id: string; name: string; price: number; isAvailable?: boolean };
}
export interface OptionCustomization {
  ingredientId: string;
  ingredientName: string;
  action: 'ADD' | 'REMOVE';
  priceDelta: number;
}

export function selectExtra(links: OptionLink[], selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) { next.delete(id); return next; }
  const group = links.find((link) => link.ingredient.id === id)?.optionGroup;
  if (group) for (const link of links) if (link.optionGroup === group) next.delete(link.ingredient.id);
  next.add(id);
  return next;
}

export function optionCustomizations(links: OptionLink[], removed: Set<string>, added: Set<string>): OptionCustomization[] {
  const groups = new Set(links.filter((link) => link.isExtra && added.has(link.ingredient.id)).map((link) => link.optionGroup).filter(Boolean));
  const result: OptionCustomization[] = [];
  for (const link of links) {
    const ingredient = link.ingredient;
    if (link.isDefault && link.isRemovable && (removed.has(ingredient.id) || (link.optionGroup && groups.has(link.optionGroup)))) {
      result.push({ ingredientId: ingredient.id, ingredientName: ingredient.name, action: 'REMOVE', priceDelta: 0 });
    }
    if (link.isExtra && added.has(ingredient.id) && ingredient.isAvailable !== false) {
      result.push({ ingredientId: ingredient.id, ingredientName: ingredient.name, action: 'ADD', priceDelta: ingredient.price });
    }
  }
  return result;
}
