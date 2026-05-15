import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import type { CategoryRow } from '@/lib/types';

interface CategoryWithCountRow extends CategoryRow {
  product_count: string;
}

export async function GET() {
  try {
    await requireAdmin();
    const rows = await query<CategoryWithCountRow>(
      `SELECT
         c.*,
         COUNT(p."id") AS product_count
       FROM "categories" c
       LEFT JOIN "products" p ON p."categoryId" = c."id"
       GROUP BY c."id"
       ORDER BY c."sortOrder" ASC`
    );

    const categories = rows.map((r) => ({
      id: r.id,
      name: r.name,
      image: r.image,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      _count: { products: Number(r.product_count) },
    }));

    return NextResponse.json({ categories });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

interface CreateCategoryBody {
  name: string;
  image?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as CreateCategoryBody;
    const id = uuidv4();
    const category = await queryOne<CategoryRow>(
      `INSERT INTO "categories"(id, name, image, "sortOrder", "isActive")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, image, "sortOrder", "isActive", "createdAt", "updatedAt"`,
      [id, body.name, body.image ?? null, body.sortOrder ?? 0, body.isActive ?? true]
    );
    return NextResponse.json({ category }, { status: 201 });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка создания категории' }, { status: 500 });
  }
}
