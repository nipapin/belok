import {createHash, randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {stockDecimal, stockMilli, stockNext, stockReasonLabels, type InventoryUnit, type StockReason} from '@/lib/inventoryStock';

export type StockOperationInput = {operationId: string; itemId: string; reason: StockReason; quantity: string | number; expectedQuantity?: string | number; note: string};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Operation = {id: string; itemId: string; reason: string; delta: string; quantityAfter: string};
const returning = 'id, item_id::text AS "itemId", reason, delta::text AS delta, quantity_after::text AS "quantityAfter"';

// Caller owns the transaction; errors must roll it back, including the operation key.
export async function applyStockOperation(client: PoolClient, actorId: string, input: StockOperationInput) {
  if (!input || !uuid.test(input.operationId ?? '') || !uuid.test(input.itemId ?? '') ||
      !Object.hasOwn(stockReasonLabels, input.reason) || typeof input.note !== 'string' || !input.note.trim() || input.note.trim().length > 500) throw new Error('OPERATION_INVALID');
  const itemId = input.itemId.toLowerCase();
  const operationId = input.operationId.toLowerCase();
  // Normalise before hashing so 1, 1.0 and 1,000 are the same request.
  const amount = stockMilli(input.quantity, 'g');
  const expected = input.expectedQuantity === undefined ? null : stockMilli(input.expectedQuantity, 'g');
  if (input.reason === 'RECOUNT' && expected === null) throw new Error('EXPECTED_REQUIRED');
  const note = input.note.trim();
  const hash = createHash('sha256').update(JSON.stringify([actorId,itemId,input.reason,amount,expected,note])).digest('hex');
  await client.query("SELECT set_config('belok.actor_user_id',$1,true)", [actorId]);
  const inserted = await client.query(`INSERT INTO inventory_operations(id,item_id,request_hash,reason,entered_quantity,expected_quantity,actor_user_id,note)
    SELECT $1,id,$3,$4,$5,$6,$7,$8 FROM inventory_items WHERE id=$2
    ON CONFLICT (id) DO NOTHING RETURNING id`, [operationId,itemId,hash,input.reason,stockDecimal(amount),expected === null ? null : stockDecimal(expected),actorId,note]);
  if (!inserted.rowCount) {
    const replay = await client.query<Operation & {request_hash: string}>(`SELECT ${returning},request_hash FROM inventory_operations WHERE id=$1 FOR UPDATE`, [operationId]);
    if (!replay.rows[0]) throw new Error('ITEM_NOT_FOUND');
    if (replay.rows[0].request_hash !== hash) throw new Error('OPERATION_CONFLICT');
    const {request_hash: _hash, ...operation} = replay.rows[0];
    void _hash;
    return {operation, replayed: true};
  }
  const locked = await client.query<{quantity: string; unit: InventoryUnit; is_active: boolean; kind: string}>(
    'SELECT quantity::text,unit,is_active,kind FROM inventory_items WHERE id=$1 FOR NO KEY UPDATE', [itemId]);
  const item = locked.rows[0];
  if (!item || !item.is_active) throw new Error('ITEM_NOT_FOUND');
  stockMilli(input.quantity, item.unit);
  const current = stockMilli(item.quantity, 'g');
  if (input.reason === 'RECOUNT' && expected !== current) throw new Error('STOCK_CHANGED');
  if (input.reason === 'OPENING') {
    const history = await client.query('SELECT id FROM inventory_movements WHERE item_id=$1 LIMIT 1', [itemId]);
    if (current !== 0 || history.rowCount) throw new Error('OPENING_EXISTS');
  }
  if (input.reason === 'RECEIPT' && item.kind === 'PREPARED') throw new Error('USE_PRODUCTION');
  const next = stockNext(current, amount, input.reason);
  const delta = next - current;
  await client.query('UPDATE inventory_items SET quantity=$2,updated_at=NOW() WHERE id=$1', [itemId,stockDecimal(next)]);
  // Zero-delta recounts are still meaningful inventory confirmations.
  await client.query(`INSERT INTO inventory_movements(id,item_id,delta,quantity_after,reason,note,operation_id)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(),itemId,stockDecimal(delta),stockDecimal(next),input.reason,note,operationId]);
  const result = await client.query<Operation>(`UPDATE inventory_operations SET delta=$2,quantity_after=$3 WHERE id=$1 RETURNING ${returning}`, [operationId,stockDecimal(delta),stockDecimal(next)]);
  return {operation: result.rows[0], replayed: false};
}
