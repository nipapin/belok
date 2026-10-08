import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { replaceProductIngredients, type IngredientLinkWrite } from '@/lib/productIngredients';
import { withTransaction } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { fetchProductById, fetchProductsWithRelations } from '@/lib/queries/products';
import { replaceProductVariants, type VariantWrite } from '@/lib/productVariants';
import { isSpicinessLevel } from '@/lib/productSpiciness';


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
  weightGrams?: string | number | null;
  spicinessLevel?: number;
  sortOrder?: number;
  ingredients?: IngredientLinkWrite[];
  variants?: VariantWrite[];
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
    if (body.spicinessLevel !== undefined && !isSpicinessLevel(body.spicinessLevel)) {
      return NextResponse.json({ error: 'Острота должна быть целым числом от 0 до 3' }, { status: 400 });
    }
    const id = uuidv4();

    await withTransaction(async (client) => {
      const maxRow = await client.query<{ max: number | string | null }>(
        `SELECT MAX("sortOrder") AS max FROM "products" WHERE "categoryId" = $1`,
        [body.categoryId]
      );
      const nextSort = Number(maxRow.rows[0]?.max ?? -1) + 1;

      await client.query(
        `INSERT INTO "products"
          (id, name, description, price, image, "categoryId", "isAvailable",
           calories, proteins, fats, carbs, fiber, "weightGrams", "sortOrder", "spicinessLevel")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
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
          toNum(body.weightGrams),
          nextSort,
          body.spicinessLevel ?? 0,
        ]
      );

      if (body.ingredients !== undefined) {
        await replaceProductIngredients(client, id, body.ingredients);
      }

      if (body.variants?.length) {
        await replaceProductVariants(client, id, body.variants);
      }
    });

    const product = await fetchProductById(id);
    return NextResponse.json({ product }, { status: 201 });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    if ((e as Error).message === 'VARIANT_VALUE') {
      return NextResponse.json({ error: 'Цена и показатели варианта должны быть неотрицательными числами; цена — с точностью до копеек' }, { status: 400 });
    }
    if ((e as Error).message === 'INGREDIENT_OPTIONS') {
      return NextResponse.json({ error: 'Проверьте ингредиенты и группы выбора. В группе допускается один заменяемый ингредиент по умолчанию' }, { status: 400 });
    }
    if ((e as Error).message === 'VARIANT_NAME') {
      return NextResponse.json({ error: 'Укажите название каждого варианта' }, { status: 400 });
    }
    console.error('Create product error:', e);
    return NextResponse.json({ error: 'Ошибка создания товара' }, { status: 500 });
  }
}

