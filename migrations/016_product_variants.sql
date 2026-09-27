CREATE TABLE IF NOT EXISTS "product_variants" (
    "id" TEXT PRIMARY KEY,
    "productId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "product_variants_productId_sortOrder_idx"
    ON "product_variants"("productId", "sortOrder");

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "variantId" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "variantName" TEXT;

DO $$
BEGIN
    ALTER TABLE "order_items"
        ADD CONSTRAINT "order_items_variantId_fkey"
        FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
