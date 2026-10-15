import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/adminAuth';
import { withTransaction } from '@/lib/db';
import { fetchProductById } from '@/lib/queries/products';
import { isToppingsCategory, parseNewTopping } from '@/lib/toppings';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin('menu');
    const draft = parseNewTopping(await request.json().catch(() => null));
    if (!draft) return NextResponse.json({ error: 'Укажите название и цену от 0 ₽, не более двух знаков после запятой' }, { status: 400 });
    const id = randomUUID();
    await withTransaction(async (client) => {
      // Concurrent quick creates reuse one category, including the first creation.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('belok:toppings-category'))`);
      const categories = await client.query<{ id: string; name: string }>(`SELECT id, name FROM categories ORDER BY "isActive" DESC, "sortOrder", id`);
      let categoryId = categories.rows.find((category) => isToppingsCategory(category.name))?.id;
      if (!categoryId) {
        categoryId = randomUUID();
        await client.query(`INSERT INTO categories(id,name,"sortOrder") SELECT $1,'Топпинги',COALESCE(MAX("sortOrder"),-1)+1 FROM categories`, [categoryId]);
      }
      await client.query(`INSERT INTO products(id,name,price,"categoryId","isAvailable","sortOrder") SELECT $1,$2,$3,$4,TRUE,COALESCE(MAX("sortOrder"),-1)+1 FROM products WHERE "categoryId"=$4`, [id,draft.name,draft.price,categoryId]);
    });
    return NextResponse.json({ product: await fetchProductById(id) }, { status: 201 });
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Create topping error:', error);
    return NextResponse.json({ error: 'Не удалось создать топпинг. Попробуйте ещё раз.' }, { status: 500 });
  }
}
