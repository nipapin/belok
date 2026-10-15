export function productHref(product: { id: string; slug?: string | null }, variant?: { id: string; slug?: string | null } | null): string {
  const path = `/menu/${encodeURIComponent(product.slug || product.id)}`;
  return variant ? `${path}?v=${encodeURIComponent(variant.slug || variant.id)}` : path;
}
