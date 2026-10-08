import type { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface IngredientLinkWrite {
  ingredientId: string;
  isDefault?: boolean;
  isRemovable?: boolean;
  isExtra?: boolean;
  optionGroup?: string | null;
}

export async function replaceProductIngredients(client: PoolClient, productId: string, raw: IngredientLinkWrite[]) {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error('INGREDIENT_OPTIONS');
  const seen = new Set<string>();
  const defaults = new Set<string>();
  const links = raw.map((link) => {
    if (!link || typeof link.ingredientId !== 'string' || !link.ingredientId || seen.has(link.ingredientId)) throw new Error('INGREDIENT_OPTIONS');
    seen.add(link.ingredientId);
    if ([link.isDefault, link.isRemovable, link.isExtra].some((flag) => flag != null && typeof flag !== 'boolean')) throw new Error('INGREDIENT_OPTIONS');
    if (link.optionGroup != null && typeof link.optionGroup !== 'string') throw new Error('INGREDIENT_OPTIONS');
    const optionGroup = link.optionGroup?.trim() || null;
    const isDefault = link.isDefault ?? true;
    const isRemovable = link.isRemovable ?? true;
    const isExtra = link.isExtra ?? false;
    if (optionGroup && (optionGroup.length > 80 || (isDefault && (!isRemovable || isExtra)) || (!isDefault && !isExtra))) throw new Error('INGREDIENT_OPTIONS');
    if (optionGroup && isDefault) {
      if (defaults.has(optionGroup)) throw new Error('INGREDIENT_OPTIONS');
      defaults.add(optionGroup);
    }
    return { ...link, optionGroup, isDefault, isRemovable, isExtra };
  });
  if (links.length) {
    const available = await client.query(`SELECT id FROM ingredients WHERE id = ANY($1::text[])`, [[...seen]]);
    if (available.rowCount !== links.length) throw new Error('INGREDIENT_OPTIONS');
  }
  await client.query(`DELETE FROM product_ingredients WHERE "productId" = $1`, [productId]);
  for (const link of links) {
    await client.query(`INSERT INTO product_ingredients
      (id, "productId", "ingredientId", "isDefault", "isRemovable", "isExtra", "optionGroup")
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uuidv4(), productId, link.ingredientId, link.isDefault, link.isRemovable, link.isExtra, link.optionGroup]);
  }
}
