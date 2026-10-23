-- Audit trail for explicit manual no-charge reconciliation.
-- Cash taken through a separate POS remains in that POS; this row never books a second sale.
CREATE TABLE IF NOT EXISTS aqsi_card_reconciliations (
  "jobId" UUID PRIMARY KEY REFERENCES aqsi_jobs(id),
  "orderId" TEXT NOT NULL REFERENCES orders(id),
  "actorId" TEXT NOT NULL,
  evidence TEXT NOT NULL CHECK (char_length(evidence) BETWEEN 12 AND 500),
  "cashPaidElsewhere" BOOLEAN NOT NULL,
  "providerStatus" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS aqsi_card_reconciliations_order ON aqsi_card_reconciliations ("orderId");
