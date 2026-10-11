import type {PoolClient} from 'pg';
import type {InventoryKind, InventoryUnit} from './inventoryStock';

// Caller owns the transaction. Classification never rewrites stock or movements.
export async function assertInventoryMetadataChange(client: PoolClient, id: string, kind: InventoryKind, unit: InventoryUnit): Promise<boolean> {
  // Share the recipe graph lock so a prepared recipe cannot be created mid-change.
  await client.query('SELECT pg_advisory_xact_lock($1)', [77134811]);
  const current = await client.query<{kind: InventoryKind; unit: InventoryUnit}>(
    'SELECT kind,unit FROM inventory_items WHERE id=$1 AND is_active=true FOR UPDATE', [id]);
  const item = current.rows[0];
  if (!item) return false;
  if (item.unit !== unit) {
    const used = await client.query<{used: boolean}>(`SELECT (
      EXISTS(SELECT 1 FROM inventory_recipe_lines WHERE item_id=$1) OR
      EXISTS(SELECT 1 FROM inventory_recipes WHERE owner_kind='PREPARED' AND owner_id=$1::uuid::text) OR
      EXISTS(SELECT 1 FROM inventory_product_links WHERE item_id=$1) OR
      EXISTS(SELECT 1 FROM inventory_batches WHERE prepared_item_id=$1) OR
      EXISTS(SELECT 1 FROM inventory_movements WHERE item_id=$1) OR
      EXISTS(SELECT 1 FROM inventory_items WHERE id=$1 AND quantity<>0)
    ) AS used`, [id]);
    if (used.rows[0].used) throw new Error('UNIT_REFERENCED');
  }
  if (item.kind !== kind && item.kind === 'PREPARED') {
    const used = await client.query<{used: boolean}>(`SELECT (
      EXISTS(SELECT 1 FROM inventory_recipes WHERE owner_kind='PREPARED' AND owner_id=$1::uuid::text) OR
      EXISTS(SELECT 1 FROM inventory_batches WHERE prepared_item_id=$1)
    ) AS used`, [id]);
    if (used.rows[0].used) throw new Error('PREPARED_REFERENCED');
  }
  if (item.kind !== kind && kind === 'PREPARED') {
    const linked = await client.query('SELECT product_id FROM inventory_product_links WHERE item_id=$1 LIMIT 1', [id]);
    if (linked.rowCount) throw new Error('PREPARED_LINKED');
  }
  return true;
}
