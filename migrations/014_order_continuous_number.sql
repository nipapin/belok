-- Continuous ticket numbers. #1 is the oldest order; the number never repeats.

DROP INDEX IF EXISTS "orders_orderDay_dailyNumber_key";

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC)::integer AS n
  FROM "orders"
)
UPDATE "orders" AS o
SET "dailyNumber" = numbered.n
FROM numbered
WHERE o.id = numbered.id;

ALTER TABLE "orders" DROP COLUMN IF EXISTS "orderDay";

DROP TABLE IF EXISTS "order_day_counters";

CREATE TABLE IF NOT EXISTS "order_counter" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "lastNumber" INTEGER NOT NULL,
  CONSTRAINT "order_counter_singleton" CHECK ("id" = 1)
);

INSERT INTO "order_counter" ("id", "lastNumber")
SELECT 1, COALESCE(MAX("dailyNumber"), 0)
FROM "orders"
ON CONFLICT ("id") DO UPDATE
SET "lastNumber" = EXCLUDED."lastNumber";

CREATE UNIQUE INDEX IF NOT EXISTS "orders_dailyNumber_key"
  ON "orders" ("dailyNumber");
