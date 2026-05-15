import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { deletePublicImage } from '@/lib/uploadStorage';
import { fetchProductById } from '@/lib/queries/products';
import type { ProductRow } from '@/lib/types';

interface IngredientLink {
  ingredientId: string;
  isDefault?: boolean;
  isRemovable?: boolean;
  isExtra?: boolean;
}

interface UpdateProductBody {
  name?: string;
  description?: string | null;
  price?: string | number;
  image?: string | null;
  categoryId?: string;
  isAvailable?: boolean;
  calories?: string | number | null;
  proteins?: string | number | null;
  fats?: string | number | null;
  carbs?: string | number | null;
  fiber?: string | number | null;
  sortOrder?: number;
  ingredients?: IngredientLink[];
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const product = await fetchProductById(id);
    if (!product) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as UpdateProductBody;

    const existing = await queryOne<ProductRow>(`SELECT * FROM "products" WHERE id = $1`, [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
    }

    const sets: string[] = [];
    const sqlParams: unknown[] = [];

    function add(column: string, value: unknown) {
      sqlParams.push(value);
      sets.push(`"${column}" = $${sqlParams.length}`);
    }

    if (body.name !== undefined) add('name', body.name);
    if (body.description !== undefined) add('description', body.description);
    if (body.price !== undefined) add('price', toNum(body.price) ?? 0);
    if (body.image !== undefined) add('image', body.image);
    if (body.categoryId !== undefined) add('categoryId', body.categoryId);
    if (body.isAvailable !== undefined) add('isAvailable', body.isAvailable);
    if (body.calories !== undefined) add('calories', toNum(body.calories));
    if (body.proteins !== undefined) add('proteins', toNum(body.proteins));
    if (body.fats !== undefined) add('fats', toNum(body.fats));
    if (body.carbs !== undefined) add('carbs', toNum(body.carbs));
    if (body.fiber !== undefined) add('fiber', toNum(body.fiber));
    if (body.sortOrder !== undefined) add('sortOrder', body.sortOrder);

    await withTransaction(async (client) => {
      if (sets.length > 0) {
        sqlParams.push(id);
        await client.query(
          `UPDATE "products" SET ${sets.join(', ')} WHERE id = $${sqlParams.length}`,
          sqlParams
        );
      }
      if (body.ingredients) {
        await client.query(`DELETE FROM "product_ingredients" WHERE "productId" = $1`, [id]);
        for (const ing of body.ingredients) {
          await client.query(
            `INSERT INTO "product_ingredients"
              (id, "productId", "ingredientId", "isDefault", "isRemovable", "isExtra")
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              uuidv4(),
              id,
              ing.ingredientId,
              ing.isDefault ?? true,
              ing.isRemovable ?? true,
              ing.isExtra ?? false,
            ]
          );
        }
      }
    });

    if (body.image !== undefined && existing.image && existing.image !== body.image) {
      await deletePublicImage(existing.image);
    }

    const product = await fetchProductById(id);
    return NextResponse.json({ product });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Update product error:', e);
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
    const existing = await queryOne<ProductRow>(`SELECT * FROM "products" WHERE id = $1`, [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
    }
    await deletePublicImage(existing.image);
    await query(`DELETE FROM "products" WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Delete product error:', e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
