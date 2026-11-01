-- New payments are visible immediately while waiting for collection/confirmation.
CREATE INDEX IF NOT EXISTS "orders_board_pending_payment_createdAt_idx"
  ON orders ("createdAt" DESC, "dailyNumber" DESC NULLS LAST, id DESC)
  WHERE "paymentMethod" IN ('CASH', 'CARD', 'SBP') AND "paymentStatus" = 'PENDING'
    AND status IN ('PENDING', 'CONFIRMED');
