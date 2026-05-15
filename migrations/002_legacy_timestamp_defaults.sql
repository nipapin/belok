-- На БД, поднятых ранними Prisma-миграциями, столбцы "createdAt" и "updatedAt"
-- объявлены NOT NULL, но без серверного DEFAULT — Prisma подставлял значения
-- из приложения. Сейчас приложение пишет в БД сырыми INSERT-ами и полагается
-- на DEFAULT CURRENT_TIMESTAMP (как в 001_init.sql для свежих БД).
--
-- Эта миграция добавляет DEFAULT любому timestamp-столбцу createdAt/updatedAt
-- в схеме public, у которого его ещё нет. Идемпотентно и безопасно на
-- свежих БД (там DEFAULT уже выставлен при CREATE TABLE — ничего не меняется).

DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND column_name IN ('createdAt', 'updatedAt')
           AND data_type LIKE 'timestamp%'
           AND column_default IS NULL
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT CURRENT_TIMESTAMP',
            rec.table_name, rec.column_name
        );
    END LOOP;
END $$;
