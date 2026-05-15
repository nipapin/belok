import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import type { IngredientRow } from '@/lib/types';

interface IngredientWithCountRow extends IngredientRow {
  product_count: string;
}

export async function GET() {
  try {
    await requireAdmin();
    const rows = await query<IngredientWithCountRow>(
      `SELECT
         i.*,
         COUNT(pi."id") AS product_count
       FROM "ingredients" i
       LEFT JOIN "product_ingredients" pi ON pi."ingredientId" = i."id"
       GROUP BY i."id"
       ORDER BY i."name" ASC`
    );

    const ingredients = rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: r.price,
      isAvailable: r.isAvailable,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      _count: { products: Number(r.product_count) },
    }));

    return NextResponse.json({ ingredients });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

interface CreateIngredientBody {
  name: string;
  price?: string | number;
  isAvailable?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as CreateIngredientBody;
    const id = uuidv4();
    const ingredient = await queryOne<IngredientRow>(
      `INSERT INTO "ingredients"(id, name, price, "isAvailable")
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, price, "isAvailable", "createdAt", "updatedAt"`,
      [id, body.name, parseFloat(String(body.price ?? 0)) || 0, body.isAvailable ?? true]
    );
    return NextResponse.json({ ingredient }, { status: 201 });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка создания ингредиента' }, { status: 500 });
  }
}
