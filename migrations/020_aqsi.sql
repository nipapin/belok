ALTER TABLE orders ADD COLUMN IF NOT EXISTS "kioskRequestId" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "kioskRequestHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_kiosk_request ON orders ("kioskRequestId") WHERE "kioskRequestId" IS NOT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS "fiscalName" TEXT;

CREATE TABLE IF NOT EXISTS aqsi_jobs (
  id UUID PRIMARY KEY,
  "orderId" TEXT REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('CARD', 'RECEIPT')),
  "deviceId" INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','SUBMITTING','PROCESSING','SUCCEEDED','FAILED','UNKNOWN','BLOCKED')),
  payload JSONB,
  "operationId" UUID,
  result JSONB,
  error TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("orderId", kind)
);
CREATE INDEX IF NOT EXISTS aqsi_jobs_pending ON aqsi_jobs (state, "createdAt");

CREATE TABLE IF NOT EXISTS aqsi_catalog_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision BIGINT NOT NULL DEFAULT 1,
  "syncedRevision" BIGINT NOT NULL DEFAULT 0,
  phase TEXT NOT NULL DEFAULT 'IDLE',
  "taskId" TEXT,
  "submittedRevision" BIGINT,
  "knownGoods" JSONB NOT NULL DEFAULT '[]',
  "pendingGoods" JSONB,
  cursor INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO aqsi_catalog_sync (id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS aqsi_operation_unique ON aqsi_jobs ("operationId") WHERE "operationId" IS NOT NULL;
CREATE OR REPLACE FUNCTION aqsi_catalog_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE aqsi_catalog_sync SET revision = revision + 1, "updatedAt" = NOW() WHERE id = 1;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS aqsi_catalog_dirty ON products;
CREATE TRIGGER aqsi_catalog_dirty AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH STATEMENT EXECUTE FUNCTION aqsi_catalog_dirty();
DROP TRIGGER IF EXISTS aqsi_catalog_dirty ON product_variants;
CREATE TRIGGER aqsi_catalog_dirty AFTER INSERT OR UPDATE OR DELETE ON product_variants FOR EACH STATEMENT EXECUTE FUNCTION aqsi_catalog_dirty();
DROP TRIGGER IF EXISTS aqsi_catalog_dirty ON categories;
CREATE TRIGGER aqsi_catalog_dirty AFTER INSERT OR UPDATE OR DELETE ON categories FOR EACH STATEMENT EXECUTE FUNCTION aqsi_catalog_dirty();
