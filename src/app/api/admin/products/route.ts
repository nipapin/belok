import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { fetchProductById, fetchProductsWithRelations } from '@/lib/queries/products';

interface IngredientLink {
  ingredientId: string;
  isDefault?: boolean;
  isRemovable?: boolean;
  isExtra?: boolean;
}

interface CreateProductBody {
  name: string;
  description?: string | null;
  price: string | number;
  image?: string | null;
  categoryId: string;
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

export async function GET() {
  try {
    await requireAdmin();
    const products = await fetchProductsWithRelations();
    return NextResponse.json({ products });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as CreateProductBody;
    const id = uuidv4();

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO "products"
          (id, name, description, price, image, "categoryId", "isAvailable",
           calories, proteins, fats, carbs, fiber, "sortOrder")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          body.name,
          body.description ?? null,
          toNum(body.price) ?? 0,
          body.image ?? null,
          body.categoryId,
          body.isAvailable ?? true,
          toNum(body.calories),
          toNum(body.proteins),
          toNum(body.fats),
          toNum(body.carbs),
          toNum(body.fiber),
          body.sortOrder ?? 0,
        ]
      );

      if (body.ingredients?.length) {
        for (const ing of body.ingredients) {
          await client.query(
            `INSERT INTO "product_ingredients"
              (id, "productId", "ingredientId", "isDefault", "isRemovable", "isExtra")
             VALUES ($1,$2,$3,$4,$5,$6)`,
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

    const product = await fetchProductById(id);
    return NextResponse.json({ product }, { status: 201 });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Create product error:', e);
    return NextResponse.json({ error: 'Ошибка создания товара' }, { status: 500 });
  }
}

