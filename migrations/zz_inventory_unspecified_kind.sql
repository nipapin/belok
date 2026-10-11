-- Add deferred classification without changing existing inventory or its history.
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_kind_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_kind_check
 CHECK (kind IN ('UNSPECIFIED','RAW','PURCHASED','PREPARED','PACKAGING'));
ALTER TABLE inventory_items ALTER COLUMN kind SET DEFAULT 'UNSPECIFIED';
