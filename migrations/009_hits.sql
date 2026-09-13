-- Hits list + migrate the default "Популярное" home block to "Хиты".
-- Notification defaults live in code; this only seeds the hits key.

INSERT INTO "app_settings" ("key", "value") VALUES (
  'hits',
  '{"productIds":[]}'::jsonb
) ON CONFLICT ("key") DO NOTHING;

UPDATE "app_settings"
SET
  "value" = jsonb_set(
    "value",
    '{blocks}',
    (
      SELECT COALESCE(
        jsonb_agg(
          CASE
            WHEN elem->>'id' = 'popular' AND elem->>'type' = 'products' THEN
              elem || '{"id":"hits","title":"Хиты","mode":"hits"}'::jsonb
            ELSE elem
          END
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements("value"->'blocks') AS elem
    )
  ),
  "updatedAt" = NOW()
WHERE "key" = 'home_layout';
