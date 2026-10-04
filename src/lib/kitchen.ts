import { z } from 'zod';

const photoUrl = z.string().max(2048).refine((url) => {
  if (!url) return true;
  if (url.startsWith('/uploads/') && !/[\\\s]/.test(url)) return true;
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}, 'Фото должно быть загружено или иметь HTTPS-ссылку');

export const kitchenCardSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
  sourceNumber: z.string().max(40),
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
  yieldText: z.string().max(1000),
  notes: z.string().max(5000),
  sourceText: z.string().max(20000),
  published: z.boolean(),
  version: z.number().int().min(0),
  ingredients: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    gross: z.string().max(100), net: z.string().max(100), output: z.string().max(100),
  })).max(100),
  steps: z.array(z.object({
    id: z.string().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(5000),
    imageUrl: photoUrl,
    timerSeconds: z.number().int().min(0).max(86400),
  })).max(100),
}).superRefine((card, context) => {
  if (card.published && (!card.steps.length || !card.ingredients.length)) {
    context.addIssue({ code: 'custom', message: 'Для публикации добавьте состав и хотя бы один шаг' });
  }
  if (new Set(card.steps.map(s => s.id)).size !== card.steps.length) {
    context.addIssue({ code: 'custom', message: 'Идентификаторы шагов должны быть уникальны' });
  }
});

export type KitchenCard = z.infer<typeof kitchenCardSchema>;
export type KitchenStep = KitchenCard['steps'][number];
export const KITCHEN_SETTING_PREFIX = 'kitchen.card.';

export async function kitchenRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Не удалось загрузить техкарты');
  return json as T;
}
