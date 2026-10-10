-- Optional photos, additive only. Apply manually to belok_dev.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS image TEXT;
