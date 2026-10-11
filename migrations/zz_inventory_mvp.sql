CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'RAW' CHECK (kind IN ('RAW','PREPARED','PACKAGING')),
  unit TEXT NOT NULL CHECK (unit IN ('g','ml','pcs')),
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_name_ci_idx ON inventory_items (LOWER(name));
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  delta NUMERIC(14,3) NOT NULL,
  quantity_after NUMERIC(14,3) NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('OPENING','RECOUNT','RECEIPT','WRITE_OFF')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_movements_item_time_idx ON inventory_movements(item_id,created_at DESC);
