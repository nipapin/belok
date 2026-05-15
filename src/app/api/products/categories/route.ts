import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { CategoryRow } from '@/lib/types';

interface CategoryWithCountRow extends CategoryRow {
  product_count: string;
}

export async function GET() {
  try {
    const rows = await query<CategoryWithCountRow>(
      `SELECT
         c."id", c."name", c."image", c."sortOrder", c."isActive",
         c."createdAt", c."updatedAt",
         COUNT(p."id") FILTER (WHERE p."isAvailable" = TRUE) AS product_count
       FROM "categories" c
       LEFT JOIN "products" p ON p."categoryId" = c."id"
       WHERE c."isActive" = TRUE
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
  } catch (error) {
    console.error('Get categories error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
