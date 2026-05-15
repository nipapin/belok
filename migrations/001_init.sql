-- Belok — единственная инициализирующая миграция.
-- Поднимает всю схему PostgreSQL для приложения с нуля.
-- Идемпотентна: можно безопасно перезапустить на чистой БД.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===========================================================================
-- ENUMs
-- ===========================================================================

DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "BonusType" AS ENUM ('EARNED', 'SPENT', 'EXPIRED', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "IngredientAction" AS ENUM ('ADD', 'REMOVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "VerificationPurpose" AS ENUM ('REGISTER', 'LOGIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===========================================================================
-- Утилитарный триггер: автоматически обновляет "updatedAt" на каждом UPDATE.
-- ===========================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- Совместимость с устаревшими схемами (БД, поднятые ранними Prisma-миграциями).
-- Полностью идемпотентно и безопасно на чистой БД (всё no-op, если объектов нет).
-- ===========================================================================

-- Старая таблица refresh_tokens заменена на sessions.
ALTER TABLE IF EXISTS "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_userId_fkey";
DROP TABLE IF EXISTS "refresh_tokens";

-- Старые verification_codes были по телефону; в новой схеме — по email.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'verification_codes'
           AND column_name = 'phone'
    ) THEN
        DROP INDEX IF EXISTS "verification_codes_phone_code_idx";
        DROP TABLE "verification_codes";
    END IF;
END $$;

-- users: phone был NOT NULL; добавляем колонки email-аутентификации, если их нет.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'
    ) THEN
        ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email"           TEXT;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash"    TEXT;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl"       TEXT;
    END IF;
END $$;

-- products: колонка fiber могла не существовать в старой схеме.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'products'
    ) THEN
        ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "fiber" DOUBLE PRECISION;
    END IF;
END $$;

-- ===========================================================================
-- Таблицы
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "loyalty_levels" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "minSpent" DOUBLE PRECISION NOT NULL,
    "cashbackPercent" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "bonusBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loyaltyLevelId" TEXT REFERENCES "loyalty_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");

DROP TRIGGER IF EXISTS users_set_updated_at ON "users";
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON "users"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId");

DROP TRIGGER IF EXISTS sessions_set_updated_at ON "sessions";
CREATE TRIGGER sessions_set_updated_at BEFORE UPDATE ON "sessions"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "categories" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS categories_set_updated_at ON "categories";
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON "categories"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "products" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "image" TEXT,
    "categoryId" TEXT NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "isAvailable" BOOLEAN NOT NULL DEFAULT TRUE,
    "calories" DOUBLE PRECISION,
    "proteins" DOUBLE PRECISION,
    "fats" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fiber" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS products_set_updated_at ON "products";
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON "products"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "ingredients" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS ingredients_set_updated_at ON "ingredients";
CREATE TRIGGER ingredients_set_updated_at BEFORE UPDATE ON "ingredients"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "product_ingredients" (
    "id" TEXT PRIMARY KEY,
    "productId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "ingredientId" TEXT NOT NULL REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "isDefault" BOOLEAN NOT NULL DEFAULT TRUE,
    "isRemovable" BOOLEAN NOT NULL DEFAULT TRUE,
    "isExtra" BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_ingredients_productId_ingredientId_key"
    ON "product_ingredients"("productId", "ingredientId");

CREATE TABLE IF NOT EXISTS "orders" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "total" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonusUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonusEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS orders_set_updated_at ON "orders";
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON "orders"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "order_items" (
    "id" TEXT PRIMARY KEY,
    "orderId" TEXT NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "productId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_item_customizations" (
    "id" TEXT PRIMARY KEY,
    "orderItemId" TEXT NOT NULL REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "ingredientId" TEXT NOT NULL,
    "action" "IngredientAction" NOT NULL,
    "priceDelta" DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "bonus_transactions" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "BonusType" NOT NULL,
    "orderId" TEXT REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "verification_codes" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "verification_codes_email_purpose_idx"
    ON "verification_codes"("email", "purpose");
