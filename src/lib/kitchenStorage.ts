import 'server-only';
import defaults from '@/data/kitchen-cards.json';
import { query, queryOne } from '@/lib/db';
import { KITCHEN_SETTING_PREFIX, type KitchenCard } from '@/lib/kitchen';

export async function readKitchenCards(): Promise<KitchenCard[]> {
  const rows = await query<{ value: KitchenCard }>(
    'SELECT value FROM app_settings WHERE starts_with(key, $1)', [KITCHEN_SETTING_PREFIX]
  );
  const cards = new Map<string, KitchenCard>(defaults.map(card => [card.id, card]));
  for (const row of rows) cards.set(row.value.id, row.value);
  return [...cards.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
}

/** A stale editor cannot silently overwrite another administrator's changes. */
export async function saveKitchenCard(card: KitchenCard): Promise<KitchenCard | null> {
  const baseline = defaults.find(c => c.id === card.id);
  // Version 0 identifies a new card; version 1 is the imported source.
  const canInsert = card.version === (baseline?.version ?? 0);
  const next = { ...card, sourceNumber: baseline?.sourceNumber ?? card.sourceNumber,
    sourceText: baseline?.sourceText ?? card.sourceText, version: card.version + 1 };
  const row = await queryOne<{ value: KitchenCard }>(
    `INSERT INTO app_settings (key, value, "updatedAt")
     SELECT $1, $2::jsonb, NOW() WHERE $4 OR EXISTS (SELECT 1 FROM app_settings WHERE key = $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()
       WHERE (app_settings.value->>'version')::integer = $3
     RETURNING value`,
    [KITCHEN_SETTING_PREFIX + card.id, JSON.stringify(next), card.version, canInsert]
  );
  return row?.value ?? null;
}
