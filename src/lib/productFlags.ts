export const NEW_PRODUCT_DAYS = 3;
const NEW_PRODUCT_MS = NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;

export function isNewProduct(createdAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const time = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return false;
  return now - time < NEW_PRODUCT_MS && now - time >= 0;
}
