ALTER TABLE "products"
  ADD COLUMN "spicinessLevel" SMALLINT NOT NULL DEFAULT 0
  CHECK ("spicinessLevel" BETWEEN 0 AND 3);
