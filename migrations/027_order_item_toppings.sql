ALTER TABLE order_items ADD COLUMN IF NOT EXISTS "parentItemId" TEXT REFERENCES order_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS order_items_parent_idx ON order_items("parentItemId");
