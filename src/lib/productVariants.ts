import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import { query } from '@/lib/db';
import { VARIANT_NUMBER_FIELDS, type VariantNumberField } from '@/lib/productOptions';

export interface VariantWrite extends Partial<Record<VariantNumberField, number | string | null>> {
  id?: string | null;
  name: string;
  image?: string | null;
}

export class VariantOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VariantOrderError';
  }
}

export async function replaceProductVariants(
  client: PoolClient,
  productId: string,
  variants: VariantWrite[]
): Promise<string[]> {
  const existing = await client.query<{ id: string; image: string | null }>(
    `SELECT id, image FROM "product_variants" WHERE "productId" = $1`,
    [productId]
  );
  const existingById = new Map(existing.rows.map((row) => [row.id, row]));
  const cleaned = variants.map((variant, index) => ({
    id: variant.id?.trim() || null,
    name: variant.name.trim(),
    image: variant.image?.trim() || null,
    sortOrder: index,
    values: VARIANT_NUMBER_FIELDS.map((field) => {
      const raw = variant[field];
      if (raw == null || raw === '') return null;
      if (typeof raw !== 'number' && typeof raw !== 'string') throw new Error('VARIANT_VALUE');
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 1000000) throw new Error('VARIANT_VALUE');
      if (field === 'price' && Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw new Error('VARIANT_VALUE');
      return value;
    }),
  }));

  if (cleaned.some((variant) => !variant.name)) {
    throw new Error('VARIANT_NAME');
  }

  const kept = new Set<string>();
  const staleImages: string[] = [];

  for (const variant of cleaned) {
    const previous = variant.id ? existingById.get(variant.id) : undefined;
    if (previous && variant.id) {
      if (previous.image && previous.image !== variant.image) staleImages.push(previous.image);
      await client.query(
        `UPDATE "product_variants"
            SET name = $1, image = $2, "sortOrder" = $3,
                ${VARIANT_NUMBER_FIELDS.map((field, i) => `"${field}" = $${i + 4}`).join(', ')}
          WHERE id = $12`,
        [variant.name, variant.image, variant.sortOrder, ...variant.values, variant.id]
      );
      kept.add(variant.id);
    } else {
      await client.query(
        `INSERT INTO "product_variants" (id, "productId", name, image, "sortOrder", ${VARIANT_NUMBER_FIELDS.map((field) => `"${field}"`).join(', ')})
         VALUES (${Array.from({ length: 13 }, (_, i) => `$${i + 1}`).join(', ')})`,
        [uuidv4(), productId, variant.name, variant.image, variant.sortOrder, ...variant.values]
      );
    }
  }

  for (const row of existing.rows) {
    if (kept.has(row.id)) continue;
    if (row.image) staleImages.push(row.image);
    await client.query(`DELETE FROM "product_variants" WHERE id = $1`, [row.id]);
  }

  return staleImages;
}

export async function attachVariantSnapshots<T extends { productId: string; variantId?: string | null }>(
  items: T[]
): Promise<(T & { variantId: string | null; variantName: string | null })[]> {
  if (items.length === 0) return [];

  const productIds = Array.from(new Set(items.map((item) => item.productId)));
  const counts = await query<{ productId: string; count: number }>(
    `SELECT "productId", COUNT(*)::int AS count
       FROM "product_variants"
      WHERE "productId" = ANY($1::text[])
      GROUP BY "productId"`,
    [productIds]
  );
  const countMap = new Map(counts.map((row) => [row.productId, Number(row.count)]));

  const variantIds = Array.from(
    new Set(items.map((item) => item.variantId).filter((id): id is string => Boolean(id)))
  );
  const rows = variantIds.length
    ? await query<{ id: string; productId: string; name: string }>(
        `SELECT id, "productId", name FROM "product_variants" WHERE id = ANY($1::text[])`,
        [variantIds]
      )
    : [];
  const variantMap = new Map(rows.map((row) => [row.id, row]));

  return items.map((item) => {
    const count = countMap.get(item.productId) ?? 0;
    const variantId = item.variantId || null;
    if (count > 0 && !variantId) {
      throw new VariantOrderError('Выберите вариант товара');
    }
    if (!variantId) return { ...item, variantId: null, variantName: null };
    const row = variantMap.get(variantId);
    if (!row || row.productId !== item.productId) {
      throw new VariantOrderError('Вариант товара не найден');
    }
    return { ...item, variantId: row.id, variantName: row.name };
  });
}
