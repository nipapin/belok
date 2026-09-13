-- YooKassa online payments removed; paymentId stored the gateway charge id.
ALTER TABLE "orders" DROP COLUMN IF EXISTS "paymentId";
