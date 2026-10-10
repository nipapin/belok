-- A combo is a menu product composed of other menu products.
ALTER TABLE products ADD COLUMN IF NOT EXISTS "isCombo" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS combo_groups (
 id TEXT PRIMARY KEY,
 "comboId" TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 "minSelect" INTEGER NOT NULL DEFAULT 1 CHECK ("minSelect" BETWEEN 1 AND 10),
 "maxSelect" INTEGER NOT NULL DEFAULT 1 CHECK ("maxSelect" BETWEEN 1 AND 10),
 "sortOrder" INTEGER NOT NULL DEFAULT 0,
 CHECK ("maxSelect">="minSelect")
);
CREATE TABLE IF NOT EXISTS combo_group_options (
 id TEXT PRIMARY KEY,
 "groupId" TEXT NOT NULL REFERENCES combo_groups(id) ON DELETE CASCADE,
 "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 "priceDelta" NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK ("priceDelta">=0),
 "sortOrder" INTEGER NOT NULL DEFAULT 0,
 UNIQUE("groupId","productId")
);
CREATE INDEX IF NOT EXISTS combo_groups_combo_idx ON combo_groups("comboId");
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS "comboSnapshot" JSONB;
