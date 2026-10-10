-- Additive product-to-stock mapping; no existing products/orders are modified.
-- Apply to belok_dev manually after backup.
CREATE TABLE IF NOT EXISTS inventory_product_links (
 product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
 item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
 quantity NUMERIC(14,3) NOT NULL CHECK(quantity > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_product_links_item_idx ON inventory_product_links(item_id);
