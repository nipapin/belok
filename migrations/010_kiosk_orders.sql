-- Kiosk / cashier terminal orders: guests without an account,
-- optional email for later claim, and order origin (app vs kiosk).

ALTER TABLE "orders" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "guestEmail" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'APP';

CREATE INDEX IF NOT EXISTS "orders_guestEmail_idx" ON "orders"("guestEmail")
    WHERE "guestEmail" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "orders_source_idx" ON "orders"("source");
