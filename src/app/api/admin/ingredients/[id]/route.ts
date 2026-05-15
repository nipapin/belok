import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import type { IngredientRow } from '@/lib/types';

interface UpdateIngredientBody {
  name?: string;
  price?: string | number;
  isAvailable?: boolean;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as UpdateIngredientBody;

    const sets: string[] = [];
    const sqlParams: unknown[] = [];
    function add(column: string, value: unknown) {
      sqlParams.push(value);
      sets.push(`"${column}" = $${sqlParams.length}`);
    }
    if (body.name !== undefined) add('name', body.name);
    if (body.price !== undefined) add('price', parseFloat(String(body.price)) || 0);
    if (body.isAvailable !== undefined) add('isAvailable', body.isAvailable);

    if (sets.length === 0) {
      const ingredient = await queryOne<IngredientRow>(
        `SELECT * FROM "ingredients" WHERE id = $1`,
        [id]
      );
      return NextResponse.json({ ingredient });
    }

    sqlParams.push(id);
    const ingredient = await queryOne<IngredientRow>(
      `UPDATE "ingredients" SET ${sets.join(', ')} WHERE id = $${sqlParams.length}
       RETURNING id, name, price, "isAvailable", "createdAt", "updatedAt"`,
      sqlParams
    );
    return NextResponse.json({ ingredient });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    await query(`DELETE FROM "ingredients" WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
