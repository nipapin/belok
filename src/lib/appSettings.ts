import { query, queryOne } from '@/lib/db';

export async function getAppSetting<T>(key: string): Promise<T | null> {
  const row = await queryOne<{ value: T }>(
    `SELECT value FROM "app_settings" WHERE key = $1`,
    [key]
  );
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: unknown): Promise<void> {
  await query(
    `INSERT INTO "app_settings" ("key", "value", "updatedAt")
     VALUES ($1, $2, NOW())
     ON CONFLICT ("key") DO UPDATE SET "value" = $2, "updatedAt" = NOW()`,
    [key, JSON.stringify(value)]
  );
}
