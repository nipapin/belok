-- T-Bank SBP payment id for app checkout. Distinct from the dropped YooKassa column.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tbankPaymentId" TEXT;

CREATE INDEX IF NOT EXISTS "orders_tbankPaymentId_idx" ON "orders"("tbankPaymentId")
    WHERE "tbankPaymentId" IS NOT NULL;
