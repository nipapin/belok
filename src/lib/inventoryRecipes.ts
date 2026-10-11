import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export type RecipeOwner = 'PRODUCT' | 'PREPARED';
export type RecipeLine = { itemId: string; quantity: number };
export type RecipeInput = { ownerKind: RecipeOwner; ownerId: string; outputQuantity: number; outputUnit: 'g'|'ml'|'pcs'; lines: RecipeLine[]; instructions?: string };
const positive = (n: number) => Number.isFinite(n) && n > 0 && Math.round(n * 1000) === n * 1000 && n <= 999999999;

export function validateRecipe(input: RecipeInput): void {
 if (!['PRODUCT','PREPARED'].includes(input.ownerKind) || !input.ownerId || !['g','ml','pcs'].includes(input.outputUnit) ||
 !positive(input.outputQuantity) || !Array.isArray(input.lines) || !input.lines.length ||
 input.lines.length > 100 || input.lines.some(line=>!line.itemId || !positive(line.quantity)) ||
 new Set(input.lines.map(line=>line.itemId)).size!==input.lines.length) throw new Error('RECIPE_INVALID');
}

export async function saveRecipe(client: PoolClient, input: RecipeInput): Promise<void> {
 validateRecipe(input);
 if(typeof input.instructions !== 'undefined' && (typeof input.instructions !== 'string'||input.instructions.length>15000))throw new Error('RECIPE_INVALID');
 // Serialise recipe graph edits to guarantee absence of cycles under concurrent writes.
 await client.query('SELECT pg_advisory_xact_lock($1)', [77134811]);
 if (input.ownerKind === 'PRODUCT') {
   const found = await client.query('SELECT id FROM products WHERE id=$1',[input.ownerId]);
   if(!found.rowCount) throw new Error('RECIPE_OWNER');
 } else {
   const found = await client.query('SELECT id,unit FROM inventory_items WHERE id::text=$1 AND kind=$2',[input.ownerId,'PREPARED']);
   if(!found.rowCount || found.rows[0].unit!==input.outputUnit) throw new Error('RECIPE_OWNER');
 }
 const items = await client.query<{id:string;kind:string}>(`SELECT id::text AS id,kind FROM inventory_items WHERE id::text = ANY($1::text[]) AND is_active=true`,[input.lines.map(x=>x.itemId)]);
 if(items.rows.length!==input.lines.length) throw new Error('RECIPE_ITEMS');
 if(input.ownerKind==='PREPARED') {
  if(input.lines.some(l=>l.itemId===input.ownerId)) throw new Error('RECIPE_CYCLE');
  const graph=await client.query<{owner_id:string;item_id:string}>(`SELECT r.owner_id,l.item_id::text AS item_id FROM inventory_recipes r
   JOIN inventory_recipe_lines l ON l.recipe_id=r.id WHERE r.owner_kind='PREPARED'`);
  const adjacency=new Map<string,string[]>();
  for(const edge of graph.rows) adjacency.set(edge.owner_id,[...(adjacency.get(edge.owner_id)??[]),edge.item_id]);
  adjacency.set(input.ownerId,input.lines.map(x=>x.itemId));
  const visiting=new Set<string>(),done=new Set<string>();
  const walk=(id:string):boolean=>{
   if(visiting.has(id))return true;if(done.has(id))return false;
   visiting.add(id);for(const next of adjacency.get(id)??[])if(walk(next))return true;
   visiting.delete(id);done.add(id);return false;
  };
  if(walk(input.ownerId))throw new Error('RECIPE_CYCLE');
 }
 const r=await client.query<{id:string}>(`INSERT INTO inventory_recipes(id,owner_kind,owner_id,output_quantity,output_unit,instructions)
 VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(owner_kind,owner_id) DO UPDATE SET output_quantity=EXCLUDED.output_quantity,output_unit=EXCLUDED.output_unit,instructions=EXCLUDED.instructions,updated_at=NOW() RETURNING id`,
 [randomUUID(),input.ownerKind,input.ownerId,input.outputQuantity,input.outputUnit,input.instructions??'']);
 await client.query('DELETE FROM inventory_recipe_lines WHERE recipe_id=$1',[r.rows[0].id]);
 for(const line of input.lines)await client.query(`INSERT INTO inventory_recipe_lines(id,recipe_id,item_id,quantity) VALUES($1,$2,$3,$4)`,[randomUUID(),r.rows[0].id,line.itemId,line.quantity]);
}
