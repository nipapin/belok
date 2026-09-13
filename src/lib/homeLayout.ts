import { brandMark } from '@/lib/brand';

export const HOME_LAYOUT_SETTING_KEY = 'home_layout';
export const HOME_LAYOUT_MAX_BLOCKS = 20;
export const HOME_LAYOUT_MAX_IMAGES = 10;
export const HOME_LAYOUT_MAX_PRODUCT_IDS = 24;

export type HomeBlockType = 'text' | 'gallery' | 'products' | 'categories' | 'contacts';

interface HomeBlockBase {
  id: string;
  type: HomeBlockType;
  title: string;
  enabled: boolean;
}

export interface TextHomeBlock extends HomeBlockBase {
  type: 'text';
  text: string;
}

export interface GalleryHomeBlock extends HomeBlockBase {
  type: 'gallery';
  text: string;
  images: string[];
}

export interface ProductsHomeBlock extends HomeBlockBase {
  type: 'products';
  mode: 'latest' | 'picked' | 'hits';
  productIds: string[];
  limit: number;
  layout: 'grid' | 'carousel';
}

export interface CategoriesHomeBlock extends HomeBlockBase {
  type: 'categories';
}

export interface ContactsHomeBlock extends HomeBlockBase {
  type: 'contacts';
  phone: string;
  address: string;
  mapUrl: string;
  hours: string;
}

export type HomeBlock =
  | TextHomeBlock
  | GalleryHomeBlock
  | ProductsHomeBlock
  | CategoriesHomeBlock
  | ContactsHomeBlock;

export interface HomeLayoutConfig {
  blocks: HomeBlock[];
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyBlock(type: HomeBlockType): HomeBlock {
  const id = newId();
  switch (type) {
    case 'text':
      return { id, type, title: 'Текст', enabled: true, text: '' };
    case 'gallery':
      return { id, type, title: 'О нас', enabled: true, text: '', images: [] };
    case 'products':
      return {
        id,
        type,
        title: 'Хиты',
        enabled: true,
        mode: 'hits',
        productIds: [],
        limit: 4,
        layout: 'grid',
      };
    case 'categories':
      return { id, type, title: 'Категории', enabled: true };
    case 'contacts':
      return {
        id,
        type,
        title: 'Контакты',
        enabled: true,
        phone: '',
        address: '',
        mapUrl: '',
        hours: '',
      };
  }
}

export const defaultHomeLayout: HomeLayoutConfig = {
  blocks: [
    {
      id: 'about',
      type: 'gallery',
      title: 'О нас',
      enabled: true,
      text: `${brandMark} — кафе здорового питания. Здесь будет ваш рассказ о заведении. Добавьте текст и фото в админке.`,
      images: [],
    },
    {
      id: 'hits',
      type: 'products',
      title: 'Хиты',
      enabled: true,
      mode: 'hits',
      productIds: [],
      limit: 4,
      layout: 'grid',
    },
    {
      id: 'contacts',
      type: 'contacts',
      title: 'Контакты',
      enabled: true,
      phone: '',
      address: '',
      mapUrl: '',
      hours: '',
    },
  ],
};

function asTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > max) return null;
  return trimmed;
}

function sanitizeImages(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > HOME_LAYOUT_MAX_IMAGES) return null;
  const images: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > 500) return null;
    images.push(item.trim());
  }
  return images;
}

function sanitizeProductIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > HOME_LAYOUT_MAX_PRODUCT_IDS) return null;
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > 64) return null;
    ids.push(item.trim());
  }
  return ids;
}

function sanitizeOneBlock(raw: unknown): HomeBlock | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (
    type !== 'text' &&
    type !== 'gallery' &&
    type !== 'products' &&
    type !== 'categories' &&
    type !== 'contacts'
  ) {
    return null;
  }

  const id =
    typeof obj.id === 'string' && obj.id.trim() && obj.id.trim().length <= 64
      ? obj.id.trim()
      : newId();
  const title = asTrimmedString(obj.title, 80);
  if (title === null || !title) return null;
  const enabled = obj.enabled !== false;

  switch (type) {
    case 'text': {
      const text = asTrimmedString(obj.text ?? '', 2000);
      if (text === null) return null;
      return { id, type, title, enabled, text };
    }
    case 'gallery': {
      const text = asTrimmedString(obj.text ?? '', 2000);
      if (text === null) return null;
      const images = sanitizeImages(obj.images ?? []);
      if (!images) return null;
      return { id, type, title, enabled, text, images };
    }
    case 'products': {
      const mode = obj.mode === 'picked' ? 'picked' : obj.mode === 'hits' ? 'hits' : 'latest';
      const layout = obj.layout === 'carousel' ? 'carousel' : 'grid';
      const limitRaw = typeof obj.limit === 'number' ? obj.limit : Number(obj.limit);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(24, Math.max(1, Math.round(limitRaw)))
        : 4;
      const productIds = sanitizeProductIds(obj.productIds ?? []);
      if (!productIds) return null;
      return { id, type, title, enabled, mode, productIds, limit, layout };
    }
    case 'categories':
      return { id, type, title, enabled };
    case 'contacts': {
      const phone = asTrimmedString(obj.phone ?? '', 40);
      const address = asTrimmedString(obj.address ?? '', 200);
      const mapUrl = asTrimmedString(obj.mapUrl ?? '', 500);
      const hours = asTrimmedString(obj.hours ?? '', 200);
      if (phone === null || address === null || mapUrl === null || hours === null) return null;
      return { id, type, title, enabled, phone, address, mapUrl, hours };
    }
  }
}

/**
 * Validates admin input for the home page builder.
 * Returns null when the payload is unusable.
 */
export function sanitizeHomeBlocks(raw: unknown): HomeBlock[] | null {
  if (!Array.isArray(raw) || raw.length > HOME_LAYOUT_MAX_BLOCKS) return null;
  const blocks: HomeBlock[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    const block = sanitizeOneBlock(item);
    if (!block) return null;
    if (seenIds.has(block.id)) {
      block.id = newId();
    }
    seenIds.add(block.id);
    blocks.push(block);
  }
  return blocks;
}

export function sanitizeHomeLayout(raw: unknown): HomeLayoutConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const blocks = sanitizeHomeBlocks((raw as { blocks?: unknown }).blocks);
  if (!blocks) return null;
  return { blocks: migratePopularBlock(blocks) };
}

/** Maps the legacy «Популярное» products block to Хиты. */
function migratePopularBlock(blocks: HomeBlock[]): HomeBlock[] {
  return blocks.map((block) => {
    if (block.type !== 'products') return block;
    if (block.id !== 'popular') return block;
    return {
      ...block,
      id: 'hits',
      title: block.title === 'Популярное' ? 'Хиты' : block.title,
      mode: 'hits',
    };
  });
}
