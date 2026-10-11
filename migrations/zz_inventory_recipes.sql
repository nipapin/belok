-- Additive BOM/production schema. Apply manually ONLY after backup and migration history audit.
CREATE TABLE IF NOT EXISTS inventory_recipes (
 id UUID PRIMARY KEY,
 owner_kind TEXT NOT NULL CHECK(owner_kind IN ('PRODUCT','PREPARED')),
 owner_id TEXT NOT NULL,
 output_quantity NUMERIC(14,3) NOT NULL CHECK(output_quantity>0),
 output_unit TEXT NOT NULL CHECK(output_unit IN ('g','ml','pcs')),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(owner_kind,owner_id)
);
CREATE TABLE IF NOT EXISTS inventory_recipe_lines (
 id UUID PRIMARY KEY,
 recipe_id UUID NOT NULL REFERENCES inventory_recipes(id) ON DELETE CASCADE,
 item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
 quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0),
 UNIQUE(recipe_id,item_id)
);
CREATE INDEX IF NOT EXISTS inventory_recipe_lines_item_idx ON inventory_recipe_lines(item_id);
CREATE TABLE IF NOT EXISTS inventory_batches (
 id UUID PRIMARY KEY,
 prepared_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
 output_quantity NUMERIC(14,3) NOT NULL CHECK(output_quantity>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 note TEXT NOT NULL DEFAULT ''
);
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reason_check
 CHECK(reason IN ('OPENING','RECOUNT','RECEIPT','WRITE_OFF','PRODUCTION_INPUT','PRODUCTION_OUTPUT','SALE'));
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES inventory_batches(id);
CREATE INDEX IF NOT EXISTS inventory_movements_batch_idx ON inventory_movements(batch_id);
