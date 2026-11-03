-- Additive integration: website accounts and existing orders are unchanged.
CREATE TABLE IF NOT EXISTS telegram_accounts (
  "telegramId" BIGINT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS telegram_chats (
  id BIGINT PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS telegram_sessions (
  "sessionId" TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  "telegramId" BIGINT NOT NULL REFERENCES telegram_accounts("telegramId") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS telegram_orders (
  "orderId" TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  "telegramId" BIGINT NOT NULL REFERENCES telegram_accounts("telegramId") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS telegram_outbox (
  id BIGSERIAL PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  "chatId" BIGINT NOT NULL,
  status TEXT NOT NULL,
  ticket TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "sentAt" TIMESTAMPTZ,
  "discardedAt" TIMESTAMPTZ,
  UNIQUE ("orderId", status)
);
CREATE INDEX IF NOT EXISTS telegram_outbox_pending_idx ON telegram_outbox("nextAttemptAt") WHERE "sentAt" IS NULL AND "discardedAt" IS NULL;
CREATE OR REPLACE FUNCTION belok_queue_telegram_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'telegram_orders' THEN
    order_id := NEW."orderId";
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    order_id := NEW.id;
  END IF;
  INSERT INTO telegram_outbox ("orderId", "chatId", status, ticket)
    SELECT o.id, t."telegramId", o.status::text, COALESCE(o."dailyNumber"::text, o.id)
    FROM orders o JOIN telegram_orders t ON t."orderId" = o.id
    JOIN telegram_chats c ON c.id = t."telegramId" AND c.active
    WHERE o.id = order_id
    ON CONFLICT ("orderId", status) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS telegram_order_created ON telegram_orders;
CREATE TRIGGER telegram_order_created AFTER INSERT ON telegram_orders FOR EACH ROW EXECUTE FUNCTION belok_queue_telegram_order();
DROP TRIGGER IF EXISTS telegram_order_status ON orders;
CREATE TRIGGER telegram_order_status AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION belok_queue_telegram_order();
