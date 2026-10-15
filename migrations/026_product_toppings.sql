CREATE TABLE IF NOT EXISTS product_toppings (
  "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "toppingId" TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("productId", "toppingId"),
  CHECK ("productId" <> "toppingId")
);
CREATE INDEX IF NOT EXISTS product_toppings_topping_idx ON product_toppings ("toppingId");
