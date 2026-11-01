-- The board polls today's paid, active orders. Historical orders must not be
-- scanned or sorted on every refresh. No order/payment data is changed.
CREATE INDEX IF NOT EXISTS "orders_board_paid_createdAt_idx"
  ON orders ("createdAt" DESC, "dailyNumber" DESC NULLS LAST, id DESC)
  WHERE "paymentStatus" = 'SUCCEEDED'
    AND status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY');

CREATE INDEX IF NOT EXISTS "order_items_orderId_id_idx"
  ON order_items ("orderId", id);
CREATE INDEX IF NOT EXISTS "order_item_customizations_orderItemId_id_idx"
  ON order_item_customizations ("orderItemId", id);
