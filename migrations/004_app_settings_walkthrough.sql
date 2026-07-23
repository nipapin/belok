-- Generic key-value app settings (JSONB), first consumer: welcome walkthrough.

CREATE TABLE IF NOT EXISTS "app_settings" (
  "key"       TEXT PRIMARY KEY,
  "value"     JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "app_settings" ("key", "value") VALUES (
  'walkthrough',
  '{
    "enabled": true,
    "version": 1,
    "slides": [
      {
        "icon": "sparkles",
        "title": "Привет! Мы — бело́к",
        "text": "Кафе здорового питания. За полминуты покажем, что здесь можно делать."
      },
      {
        "icon": "salad",
        "title": "Меню и заказ",
        "text": "Выбирайте блюда, настраивайте состав под себя — уберите или добавьте ингредиенты — и оплачивайте онлайн."
      },
      {
        "icon": "qr-code",
        "title": "Бонусы за каждый заказ",
        "text": "Кэшбэк с каждой покупки — и в приложении, и на кассе по вашему QR-коду. Бонусами можно оплачивать заказы."
      },
      {
        "icon": "user-plus",
        "title": "Начнём?",
        "text": "Создайте аккаунт, чтобы копить бонусы, или просто загляните в меню."
      }
    ]
  }'::jsonb
) ON CONFLICT ("key") DO NOTHING;
