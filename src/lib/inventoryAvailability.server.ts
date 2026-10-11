import { query, queryOne } from '@/lib/db';
import { calculateAvailability, type StockAvailability, type StockRequirement } from './inventoryAvailability';

type RequirementRow = StockRequirement & { productId: string };
export async function loadStockAvailability(ids: string[]): Promise<Map<string, StockAvailability>> {
  const requirements = await loadStockRequirements(ids);
  return new Map(ids.map(id => [id, requirements ? calculateAvailability(requirements.get(id) ?? []) : { state: 'UNCONFIGURED', portions: null, reasons: ['Складская схема не подключена'] }]));
}

export async function loadStockRequirements(ids: string[]): Promise<Map<string, StockRequirement[]> | null> {
  if (!ids.length) return new Map();
  // Existing installations without inventory migrations retain their manual menu controls.
  const schema = await queryOne<{ ready: boolean }>(`SELECT to_regclass('inventory_recipes') IS NOT NULL
    AND to_regclass('inventory_recipe_lines') IS NOT NULL AND to_regclass('inventory_product_links') IS NOT NULL AS ready`);
  if (!schema?.ready) return null;
  // One statement gives all requirements and stock from the same database snapshot.
  const rows = await query<RequirementRow>(`WITH requirements AS (
    SELECT r.owner_id AS product_id, l.item_id,
      CASE WHEN r.output_unit='pcs' THEN l.quantity/r.output_quantity
        WHEN r.output_unit='g' AND p."weightGrams">0 THEN l.quantity*p."weightGrams"/r.output_quantity
        ELSE NULL END AS required
    FROM inventory_recipes r JOIN inventory_recipe_lines l ON l.recipe_id=r.id
    JOIN products p ON p.id=r.owner_id WHERE r.owner_kind='PRODUCT' AND r.owner_id=ANY($1::text[])
    AND NOT EXISTS(SELECT 1 FROM inventory_product_links pl WHERE pl.product_id=r.owner_id)
    UNION ALL SELECT product_id,item_id,quantity FROM inventory_product_links WHERE product_id=ANY($1::text[])
  ) SELECT r.product_id AS "productId", i.id::text AS "itemId", i.name, i.unit,
    r.required::text AS required, i.quantity::text AS quantity, i.is_active AS active
    FROM requirements r JOIN inventory_items i ON i.id=r.item_id`, [ids]);
  const grouped = new Map<string, StockRequirement[]>();
  for (const row of rows) grouped.set(row.productId, [...(grouped.get(row.productId) ?? []), row]);
  return grouped;
}
