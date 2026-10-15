import type { PoolClient } from 'pg';
import { query } from '@/lib/db';
import { loadStockAvailability } from '@/lib/inventoryAvailability.server';
import { isToppingsCategory, type ToppingProduct } from '@/lib/toppings';
import type { ProductVariantRow } from '@/lib/types';

export class ToppingValidationError extends Error {}

export async function replaceProductToppings(client: PoolClient, productId: string, raw: unknown) {
  if (!Array.isArray(raw) || raw.length > 100 || raw.some((id) => typeof id !== 'string' || !id || id.length > 128) || new Set(raw).size !== raw.length || raw.includes(productId)) {
    throw new ToppingValidationError('Некорректный список топпингов');
  }
  const ids = raw as string[];
  await client.query(`SELECT id FROM products WHERE id=$1 FOR UPDATE`, [productId]);
  if (ids.length) {
    const result = await client.query<{ id: string; categoryName: string }>(
      `SELECT p.id, c.name AS "categoryName" FROM products p JOIN categories c ON c.id=p."categoryId" WHERE p.id=ANY($1::text[]) FOR SHARE OF p, c`, [ids]
    );
    if (result.rows.length !== ids.length || result.rows.some((row) => !isToppingsCategory(row.categoryName))) {
      throw new ToppingValidationError('Выберите товары из категории «Топпинги»');
    }
  }
  await client.query(`DELETE FROM product_toppings WHERE "productId"=$1`, [productId]);
  if (ids.length) await client.query(
    `INSERT INTO product_toppings ("productId", "toppingId", "sortOrder") SELECT $1, id, ordinality-1 FROM unnest($2::text[]) WITH ORDINALITY AS selected(id, ordinality)`, [productId, ids]
  );
}

export async function loadProductToppings(ids: string[], stockAvailability = false): Promise<Map<string, ToppingProduct[]>> {
  const result = new Map<string, ToppingProduct[]>();
  if (!ids.length) return result;
  const rows = await query<ToppingProduct & { productId: string; categoryName: string }>(
    `SELECT pt."productId", p.id, p.name, p.price, p.image, p."isAvailable", c."isActive" AS "categoryActive", c.name AS "categoryName"
     FROM product_toppings pt JOIN products p ON p.id=pt."toppingId" JOIN categories c ON c.id=p."categoryId"
     WHERE pt."productId"=ANY($1::text[]) ORDER BY pt."sortOrder", p.name`, [ids]
  );
  const toppingIds = [...new Set(rows.map((row) => row.id))];
  if (!toppingIds.length) return result;
  const variants = await query<ProductVariantRow>(`SELECT * FROM product_variants WHERE "productId"=ANY($1::text[]) ORDER BY "sortOrder", name`, [toppingIds]);
  const stock = stockAvailability ? await loadStockAvailability(toppingIds) : null;
  for (const row of rows) {
    // Moving a product out of the topping category also removes it from suggestions.
    if (!isToppingsCategory(row.categoryName)) continue;
    const topping: ToppingProduct = {
      id: row.id, name: row.name, price: row.price, image: row.image,
      isAvailable: row.isAvailable && stock?.get(row.id)?.state !== 'STOP',
      categoryActive: row.categoryActive, variants: variants.filter((variant) => variant.productId === row.id),
    };
    result.set(row.productId, [...(result.get(row.productId) ?? []), topping]);
  }
  return result;
}
