-- Speakable ticket numbers: #1, #2, … resetting each calendar day in Europe/Moscow.
-- The order id stays a uuid. dailyNumber is what the cashier and the guest say.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "dailyNumber" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "orderDay" DATE;

WITH numbered AS (
  SELECT
    id,
    (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow')::date AS day,
    ROW_NUMBER() OVER (
      PARTITION BY (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow')::date
      ORDER BY "createdAt" ASC, id ASC
    )::integer AS n
  FROM "orders"
  WHERE "dailyNumber" IS NULL
)
UPDATE "orders" AS o
SET
  "dailyNumber" = numbered.n,
  "orderDay" = numbered.day
FROM numbered
WHERE o.id = numbered.id;

CREATE TABLE IF NOT EXISTS "order_day_counters" (
  "day" DATE PRIMARY KEY,
  "lastNumber" INTEGER NOT NULL
);

INSERT INTO "order_day_counters" ("day", "lastNumber")
SELECT "orderDay", MAX("dailyNumber")
FROM "orders"
WHERE "orderDay" IS NOT NULL AND "dailyNumber" IS NOT NULL
GROUP BY "orderDay"
ON CONFLICT ("day") DO UPDATE
SET "lastNumber" = GREATEST("order_day_counters"."lastNumber", EXCLUDED."lastNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "orders_orderDay_dailyNumber_key"
  ON "orders" ("orderDay", "dailyNumber");
