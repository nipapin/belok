import { getAppSetting, setAppSetting } from '@/lib/appSettings';
import { query } from '@/lib/db';

export const HITS_SETTING_KEY = 'hits';
export const HITS_MAX_PRODUCT_IDS = 24;
const DEFAULT_LIMIT = 6;
const PERIOD_DAYS = 30;

export type HitsConfig = { productIds: string[]; excludedIds: string[]; limit: number };
export type HitsResult = HitsConfig & { suggestedIds: string[]; sales: Record<string, number> };
export const defaultHitsConfig: HitsConfig = { productIds: [], excludedIds: [], limit: DEFAULT_LIMIT };

const cleanIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= 64).map(x => x.trim()))].slice(0,HITS_MAX_PRODUCT_IDS);
};
export function sanitizeHitsConfig(raw: unknown): HitsConfig {
  if (!raw || typeof raw !== 'object') return { ...defaultHitsConfig };
  const data = raw as Record<string,unknown>;
  const limit = typeof data.limit === 'number' && Number.isInteger(data.limit) ? Math.max(4, Math.min(8,data.limit)) : DEFAULT_LIMIT;
  return { productIds: cleanIds(data.productIds), excludedIds: cleanIds(data.excludedIds), limit };
}
export async function getStoredHitsConfig(): Promise<HitsConfig> {
  return sanitizeHitsConfig(await getAppSetting<unknown>(HITS_SETTING_KEY));
}
type SalesRow = { id: string; quantity: string };
const isAccessory = (name:string, category:string) => {
  const text = (name+' '+category).toLocaleLowerCase('ru');
  return /(?:стаканчик|стаканы|стакан одноразов|крышк[иа]|контейнер|салфетк|пакет|упаковк|приборы|ложк[иа] одноразов|вилк[иа] одноразов|трубочк)/u.test(text);
};
export async function resolveHitsConfig(config: HitsConfig): Promise<HitsResult> {
  const salesRows = await query<SalesRow>(
    `SELECT oi."productId" AS id, SUM(oi.quantity)::text AS quantity
     FROM order_items oi
     JOIN orders o ON o.id=oi."orderId"
     WHERE o.status='COMPLETED' AND o."createdAt" >= NOW() - INTERVAL '30 days'
       AND (o."paymentStatus"='SUCCEEDED' OR o."paymentMethod" IN ('CASH','BONUS'))
     GROUP BY oi."productId" ORDER BY SUM(oi.quantity) DESC, oi."productId" ASC`
  );
  const products = await query<{id:string;name:string;category:string}>(
    `SELECT p.id,p.name,c.name AS category FROM products p JOIN categories c ON c.id=p."categoryId"
     WHERE p."isAvailable"=TRUE AND c."isActive"=TRUE`
  );
  const eligible = new Set(products.filter(p=>!isAccessory(p.name,p.category)).map(p=>p.id));
  const excluded = new Set(config.excludedIds);
  const pins = config.productIds.filter(id=>eligible.has(id)&&!excluded.has(id)).slice(0,config.limit);
  const suggested = salesRows.filter(row=>eligible.has(row.id)&&!excluded.has(row.id)&&!pins.includes(row.id));
  const suggestedIds = suggested.slice(0,config.limit-pins.length).map(row=>row.id);
  const sales = Object.fromEntries(salesRows.map(row=>[row.id,Number(row.quantity)]));
  return { ...config, productIds:[...pins,...suggestedIds], suggestedIds, sales };
}
export async function getHitsConfig(): Promise<HitsResult> {
  return resolveHitsConfig(await getStoredHitsConfig());
}
export async function saveHitsConfig(next: HitsConfig): Promise<HitsResult> {
  const config=sanitizeHitsConfig(next);
  await setAppSetting(HITS_SETTING_KEY,config);
  return resolveHitsConfig(config);
}
export { PERIOD_DAYS };
