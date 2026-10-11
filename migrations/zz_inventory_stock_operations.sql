-- Apply manually to the intended dev database after backup.
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_kind_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_kind_check
 CHECK (kind IN ('RAW','PURCHASED','PREPARED','PACKAGING'));

CREATE TABLE IF NOT EXISTS inventory_operations (
 id UUID PRIMARY KEY,
 item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
 request_hash TEXT NOT NULL,
 reason TEXT NOT NULL CHECK (reason IN ('OPENING','RECEIPT','WRITE_OFF','RECOUNT')),
 entered_quantity NUMERIC(14,3) NOT NULL CHECK (entered_quantity >= 0),
 expected_quantity NUMERIC(14,3),
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 note TEXT NOT NULL,
 delta NUMERIC(14,3),
 quantity_after NUMERIC(14,3),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_operations_item_time_idx ON inventory_operations(item_id,created_at DESC);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS operation_id UUID UNIQUE REFERENCES inventory_operations(id) ON DELETE RESTRICT;
