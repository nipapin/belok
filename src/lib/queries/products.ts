import { query } from '@/lib/db';
import type {
  CategoryRow,
  IngredientRow,
  ProductRow,
  ProductWithRelations,
} from '@/lib/types';

export interface ProductFilter {
  categoryId?: string | null;
  onlyAvailable?: boolean;
  productId?: string;
}

interface ProductJoinedRow extends ProductRow {
  c_id: string;
  c_name: string;
  c_image: string | null;
  c_sortOrder: number;
  c_isActive: boolean;
  c_createdAt: Date;
  c_updatedAt: Date;
}

interface IngredientJoinedRow {
  pi_id: string;
  pi_productId: string;
  pi_ingredientId: string;
  pi_isDefault: boolean;
  pi_isRemovable: boolean;
  pi_isExtra: boolean;
  i_id: string;
  i_name: string;
  i_price: number;
  i_isAvailable: boolean;
  i_createdAt: Date;
  i_updatedAt: Date;
}

function rowToCategory(row: ProductJoinedRow): CategoryRow {
  return {
    id: row.c_id,
    name: row.c_name,
    image: row.c_image,
    sortOrder: row.c_sortOrder,
    isActive: row.c_isActive,
    createdAt: row.c_createdAt,
    updatedAt: row.c_updatedAt,
  };
}

function rowToProduct(row: ProductJoinedRow): ProductWithRelations {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    image: row.image,
    categoryId: row.categoryId,
    isAvailable: row.isAvailable,
    calories: row.calories,
    proteins: row.proteins,
    fats: row.fats,
    carbs: row.carbs,
    fiber: row.fiber,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    category: rowToCategory(row),
    ingredients: [],
  };
}

export async function fetchProductsWithRelations(
  filter: ProductFilter = {}
): Promise<ProductWithRelations[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.onlyAvailable) where.push(`p."isAvailable" = TRUE`);
  if (filter.categoryId) {
    params.push(filter.categoryId);
    where.push(`p."categoryId" = $${params.length}`);
  }
  if (filter.productId) {
    params.push(filter.productId);
    where.push(`p."id" = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const products = await query<ProductJoinedRow>(
    `SELECT
       p."id", p."name", p."description", p."price", p."image", p."categoryId",
       p."isAvailable", p."calories", p."proteins", p."fats", p."carbs", p."fiber",
       p."sortOrder", p."createdAt", p."updatedAt",
       c."id"        AS "c_id",
       c."name"      AS "c_name",
       c."image"     AS "c_image",
       c."sortOrder" AS "c_sortOrder",
       c."isActive"  AS "c_isActive",
       c."createdAt" AS "c_createdAt",
       c."updatedAt" AS "c_updatedAt"
     FROM "products" p
     JOIN "categories" c ON c."id" = p."categoryId"
     ${whereSql}
     ORDER BY p."sortOrder" ASC, p."name" ASC`,
    params
  );

  if (products.length === 0) return [];

  const productMap = new Map<string, ProductWithRelations>();
  const ids: string[] = [];
  for (const r of products) {
    const product = rowToProduct(r);
    productMap.set(product.id, product);
    ids.push(product.id);
  }

  const ingredients = await query<IngredientJoinedRow>(
    `SELECT
       pi."id"           AS "pi_id",
       pi."productId"    AS "pi_productId",
       pi."ingredientId" AS "pi_ingredientId",
       pi."isDefault"    AS "pi_isDefault",
       pi."isRemovable"  AS "pi_isRemovable",
       pi."isExtra"      AS "pi_isExtra",
       i."id"            AS "i_id",
       i."name"          AS "i_name",
       i."price"         AS "i_price",
       i."isAvailable"   AS "i_isAvailable",
       i."createdAt"     AS "i_createdAt",
       i."updatedAt"     AS "i_updatedAt"
     FROM "product_ingredients" pi
     JOIN "ingredients" i ON i."id" = pi."ingredientId"
     WHERE pi."productId" = ANY($1::text[])
     ORDER BY i."name" ASC`,
    [ids]
  );

  for (const row of ingredients) {
    const ingredient: IngredientRow = {
      id: row.i_id,
      name: row.i_name,
      price: row.i_price,
      isAvailable: row.i_isAvailable,
      createdAt: row.i_createdAt,
      updatedAt: row.i_updatedAt,
    };
    const product = productMap.get(row.pi_productId);
    if (!product) continue;
    product.ingredients.push({
      id: row.pi_id,
      productId: row.pi_productId,
      ingredientId: row.pi_ingredientId,
      isDefault: row.pi_isDefault,
      isRemovable: row.pi_isRemovable,
      isExtra: row.pi_isExtra,
      ingredient,
    });
  }

  return products.map((r) => productMap.get(r.id)!);
}

export async function fetchProductById(id: string): Promise<ProductWithRelations | null> {
  const list = await fetchProductsWithRelations({ productId: id });
  return list[0] ?? null;
}
