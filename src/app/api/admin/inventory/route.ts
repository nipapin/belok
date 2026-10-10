import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
const units = ['g', 'ml', 'pcs'] as const;
const kinds = ['RAW', 'PREPARED', 'PACKAGING'] as const;
const validQuantity = (value: unknown) => {
  const n = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n >= 0 && Math.round(n * 1000) === n * 1000 && n <= 999999999;
};
const errorResponse = (error: unknown) => {
  if ((error as Error).message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'Такая позиция уже существует' }, { status: 409 });
  console.error('Inventory API:', error);
  return NextResponse.json({ error: 'Ошибка склада. Проверьте, что миграция применена.' }, { status: 500 });
};
export async function GET() {
  try {
    await requireAdmin();
    const items = await query(`SELECT id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",notes,is_active AS "isActive" FROM inventory_items ORDER BY name COLLATE "default"`);
    return NextResponse.json({ items });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 160 || !units.includes(body.unit) || !kinds.includes(body.kind) ||
      !validQuantity(body.quantity) || !validQuantity(body.minQuantity ?? 0)) {
      return NextResponse.json({ error: 'Проверьте название, единицу и количества' }, { status: 400 });
    }
    const item = await withTransaction(async client => {
      const id = randomUUID();
      const rows = await client.query(
        `INSERT INTO inventory_items(id,name,kind,unit,quantity,min_quantity,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",notes`,
        [id,name,body.kind,body.unit,body.quantity,body.minQuantity ?? 0,String(body.notes ?? '').slice(0,1000)]
      );
      if (Number(body.quantity) > 0) await client.query(
        `INSERT INTO inventory_movements(id,item_id,delta,quantity_after,reason,note) VALUES ($1,$2,$3,$3,'OPENING','Первичный остаток')`,
        [randomUUID(),id,body.quantity]
      );
      return rows.rows[0];
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch(error) { return errorResponse(error); }
}
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    if (typeof body.id !== 'string' || !validQuantity(body.quantity) || (body.minQuantity !== undefined && !validQuantity(body.minQuantity))) {
      return NextResponse.json({ error: 'Некорректное количество' }, { status: 400 });
    }
    const result = await withTransaction(async client => {
      const locked = await client.query<{ quantity: string }>('SELECT quantity::text AS quantity FROM inventory_items WHERE id=$1 FOR UPDATE',[body.id]);
      if (!locked.rows.length) return null;
      const original = Number(locked.rows[0].quantity);
      const next = Number(body.quantity);
      const updated = await client.query(
        `UPDATE inventory_items SET quantity=$2, min_quantity=COALESCE($3,min_quantity),updated_at=NOW()
         WHERE id=$1 RETURNING id,name,kind,unit,quantity::text AS quantity,min_quantity::text AS "minQuantity",notes`,
        [body.id,next,body.minQuantity ?? null]
      );
      if (next !== original) await client.query(
        `INSERT INTO inventory_movements(id,item_id,delta,quantity_after,reason,note) VALUES ($1,$2,$3,$4,'RECOUNT',$5)`,
        [randomUUID(),body.id,next-original,next,String(body.note ?? 'Ручная корректировка').slice(0,500)]
      );
      return updated.rows[0];
    });
    return result ? NextResponse.json({ item: result }) : NextResponse.json({ error: 'Позиция не найдена' },{status:404});
  } catch(error) { return errorResponse(error); }
}
