ALTER TABLE "product_variants"
    ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION CHECK ("price" >= 0 AND "price" < 'Infinity'::float8),
    ADD COLUMN IF NOT EXISTS "calories" DOUBLE PRECISION CHECK ("calories" >= 0 AND "calories" < 'Infinity'::float8),
    ADD COLUMN IF NOT EXISTS "proteins" DOUBLE PRECISION CHECK ("proteins" >= 0 AND "proteins" < 'Infinity'::float8),
    ADD COLUMN IF NOT EXISTS "fats" DOUBLE PRECISION CHECK ("fats" >= 0 AND "fats" < 'Infinity'::float8),
    ADD COLUMN IF NOT EXISTS "carbs" DOUBLE PRECISION CHECK ("carbs" >= 0 AND "carbs" < 'Infinity'::float8),
    ADD COLUMN IF NOT EXISTS "fiber" DOUBLE PRECISION CHECK ("fiber" >= 0 AND "fiber" < 'Infinity'::float8),
    ADD COLUMN IF NOT EXISTS "weightGrams" DOUBLE PRECISION CHECK ("weightGrams" >= 0 AND "weightGrams" < 'Infinity'::float8),
    ADD COLUMN IF NOT EXISTS "volumeMl" DOUBLE PRECISION CHECK ("volumeMl" >= 0 AND "volumeMl" < 'Infinity'::float8);

-- Links with the same group offer a single choice, e.g. type of milk or syrup.
ALTER TABLE "product_ingredients" ADD COLUMN IF NOT EXISTS "optionGroup" TEXT;
ALTER TABLE "order_item_customizations" ADD COLUMN IF NOT EXISTS "ingredientName" TEXT;
UPDATE "order_item_customizations" c SET "ingredientName" = i.name
  FROM "ingredients" i WHERE i.id = c."ingredientId" AND c."ingredientName" IS NULL;
