CREATE TABLE IF NOT EXISTS "saved_addresses" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "saved_addresses_userId_idx" ON "saved_addresses"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "saved_addresses_userId_name_key" ON "saved_addresses"("userId", "name");

DROP TRIGGER IF EXISTS saved_addresses_set_updated_at ON "saved_addresses";
CREATE TRIGGER saved_addresses_set_updated_at BEFORE UPDATE ON "saved_addresses"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
