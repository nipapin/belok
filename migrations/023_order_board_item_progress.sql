ALTER TABLE "order_items"
  ADD COLUMN "preparedQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "order_items_prepared_quantity_range"
    CHECK ("preparedQuantity" >= 0 AND "preparedQuantity" <= quantity);
