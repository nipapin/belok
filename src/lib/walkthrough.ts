import { brandMark } from '@/lib/brand';

export interface WalkthroughSlide {
  icon: string;
  title: string;
  text: string;
}

export interface WalkthroughConfig {
  enabled: boolean;
  version: number;
  slides: WalkthroughSlide[];
}

export const WALKTHROUGH_SETTING_KEY = 'walkthrough';
export const WALKTHROUGH_MAX_SLIDES = 10;

/** Icon keys the admin can pick from (mapped to lucide icons on the client). */
export const WALKTHROUGH_ICONS = [
  'sparkles',
  'salad',
  'qr-code',
  'user-plus',
  'gift',
  'star',
  'bell',
  'heart',
  'rocket',
  'percent',
] as const;

export type WalkthroughIcon = (typeof WALKTHROUGH_ICONS)[number];

export const WALKTHROUGH_ICON_LABELS: Record<WalkthroughIcon, string> = {
  sparkles: 'Искры',
  salad: 'Салат',
  'qr-code': 'QR-код',
  'user-plus': 'Регистрация',
  gift: 'Подарок',
  star: 'Звезда',
  bell: 'Колокольчик',
  heart: 'Сердце',
  rocket: 'Ракета',
  percent: 'Процент',
};

/** Fallback when the DB has no config yet (mirrors migration 004 seed). */
export const defaultWalkthroughConfig: WalkthroughConfig = {
  enabled: true,
  version: 1,
  slides: [
    {
      icon: 'sparkles',
      title: `Привет! Мы — ${brandMark}`,
      text: 'Кафе здорового питания. За полминуты покажем, что здесь можно делать.',
    },
    {
      icon: 'salad',
      title: 'Меню и заказ',
      text: 'Выбирайте блюда, настраивайте состав под себя — уберите или добавьте ингредиенты — и оплачивайте онлайн.',
    },
    {
      icon: 'qr-code',
      title: 'Бонусы за каждый заказ',
      text: 'Кэшбэк с каждой покупки — и в приложении, и на кассе по вашему QR-коду. Бонусами можно оплачивать заказы.',
    },
    {
      icon: 'user-plus',
      title: 'Начнём?',
      text: 'Создайте аккаунт, чтобы копить бонусы, или просто загляните в меню.',
    },
  ],
};

/**
 * Validates admin input. Returns null when the shape is unusable;
 * unknown icons degrade to 'sparkles' instead of failing the save.
 */
export function sanitizeWalkthroughSlides(raw: unknown): WalkthroughSlide[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > WALKTHROUGH_MAX_SLIDES) return null;
  const slides: WalkthroughSlide[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const { icon, title, text } = item as Record<string, unknown>;
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 80) return null;
    if (typeof text !== 'string' || text.trim().length > 300) return null;
    const iconKey =
      typeof icon === 'string' && (WALKTHROUGH_ICONS as readonly string[]).includes(icon)
        ? icon
        : 'sparkles';
    slides.push({ icon: iconKey, title: title.trim(), text: text.trim() });
  }
  return slides;
}
