-- Main page is hidden until an admin turns it on in /admin/home.
INSERT INTO "app_settings" ("key", "value") VALUES (
  'home_published',
  'false'::jsonb
) ON CONFLICT ("key") DO NOTHING;
