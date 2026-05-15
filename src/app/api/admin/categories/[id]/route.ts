import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import type { CategoryRow } from '@/lib/types';

interface UpdateCategoryBody {
  name?: string;
  image?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as UpdateCategoryBody;

    const sets: string[] = [];
    const sqlParams: unknown[] = [];
    function add(column: string, value: unknown) {
      sqlParams.push(value);
      sets.push(`"${column}" = $${sqlParams.length}`);
    }
    if (body.name !== undefined) add('name', body.name);
    if (body.image !== undefined) add('image', body.image);
    if (body.sortOrder !== undefined) add('sortOrder', body.sortOrder);
    if (body.isActive !== undefined) add('isActive', body.isActive);

    if (sets.length === 0) {
      const category = await queryOne<CategoryRow>(`SELECT * FROM "categories" WHERE id = $1`, [id]);
      return NextResponse.json({ category });
    }

    sqlParams.push(id);
    const category = await queryOne<CategoryRow>(
      `UPDATE "categories" SET ${sets.join(', ')} WHERE id = $${sqlParams.length}
       RETURNING id, name, image, "sortOrder", "isActive", "createdAt", "updatedAt"`,
      sqlParams
    );
    return NextResponse.json({ category });
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
    await query(`DELETE FROM "categories" WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
