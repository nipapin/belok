-- Push-уведомления.
-- Идемпотентно: безопасно перезапустить.

-- Тип аудитории для рассылки из админки.
DO $$ BEGIN
    CREATE TYPE "PushAudienceType" AS ENUM ('ALL', 'LOYALTY_LEVEL', 'USER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===========================================================================
-- push_subscriptions
-- Одна запись = одно устройство/браузер пользователя.
-- endpoint уникален глобально (Web Push spec).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key"
    ON "push_subscriptions"("endpoint");

CREATE INDEX IF NOT EXISTS "push_subscriptions_userId_idx"
    ON "push_subscriptions"("userId");

DROP TRIGGER IF EXISTS push_subscriptions_set_updated_at ON "push_subscriptions";
CREATE TRIGGER push_subscriptions_set_updated_at BEFORE UPDATE ON "push_subscriptions"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- push_notifications
-- История ручных рассылок из админки. Системные (статус заказа, бонусы)
-- сюда не пишутся, чтобы не загрязнять журнал админа.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "push_notifications" (
    "id" TEXT PRIMARY KEY,
    "sentByUserId" TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "audienceType" "PushAudienceType" NOT NULL,
    -- Для LOYALTY_LEVEL — id уровня; для USER — id пользователя; для ALL — NULL.
    "audienceValue" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "push_notifications_createdAt_idx"
    ON "push_notifications"("createdAt" DESC);
