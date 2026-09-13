import { getAppSetting, setAppSetting } from '@/lib/appSettings';

export const HITS_SETTING_KEY = 'hits';
export const HITS_MAX_PRODUCT_IDS = 24;

export type HitsConfig = {
  productIds: string[];
};

export const defaultHitsConfig: HitsConfig = { productIds: [] };

export function sanitizeHitsConfig(raw: unknown): HitsConfig {
  if (!raw || typeof raw !== 'object') return { ...defaultHitsConfig };
  const idsRaw = (raw as { productIds?: unknown }).productIds;
  if (!Array.isArray(idsRaw)) return { ...defaultHitsConfig };
  const productIds: string[] = [];
  for (const item of idsRaw) {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > 64) continue;
    const id = item.trim();
    if (productIds.includes(id)) continue;
    productIds.push(id);
    if (productIds.length >= HITS_MAX_PRODUCT_IDS) break;
  }
  return { productIds };
}

export async function getHitsConfig(): Promise<HitsConfig> {
  const value = await getAppSetting<unknown>(HITS_SETTING_KEY);
  return sanitizeHitsConfig(value);
}

export async function saveHitsConfig(next: HitsConfig): Promise<HitsConfig> {
  const config = sanitizeHitsConfig(next);
  await setAppSetting(HITS_SETTING_KEY, config);
  return config;
}
