-- Home page block builder config in app_settings.

INSERT INTO "app_settings" ("key", "value") VALUES (
  'home_layout',
  '{
    "blocks": [
      {
        "id": "about",
        "type": "gallery",
        "title": "О нас",
        "enabled": true,
        "text": "бело́к — кафе здорового питания. Здесь будет ваш рассказ о заведении. Добавьте текст и фото в админке.",
        "images": []
      },
      {
        "id": "popular",
        "type": "products",
        "title": "Популярное",
        "enabled": true,
        "mode": "latest",
        "productIds": [],
        "limit": 4,
        "layout": "grid"
      },
      {
        "id": "contacts",
        "type": "contacts",
        "title": "Контакты",
        "enabled": true,
        "phone": "",
        "address": "",
        "mapUrl": "",
        "hours": ""
      }
    ]
  }'::jsonb
) ON CONFLICT ("key") DO NOTHING;
