-- Distinguish abandoning an order from transferring it to cashier payment.
ALTER TABLE aqsi_jobs ADD COLUMN IF NOT EXISTS "cancelIntent" TEXT
  CHECK ("cancelIntent" IN ('CANCEL', 'DEFER'));
