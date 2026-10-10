-- Optional preparation notes attached to the composition card; no changes to existing recipes.
ALTER TABLE inventory_recipes ADD COLUMN IF NOT EXISTS instructions TEXT NOT NULL DEFAULT '';
