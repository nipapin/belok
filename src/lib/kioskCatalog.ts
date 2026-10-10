export const kioskCatalogRefresh = {
  staleTime: 0,
  refetchInterval: 5000,
  refetchOnWindowFocus: 'always',
  refetchOnReconnect: 'always',
} as const;

export async function fetchKioskCatalog<T>(url: string, signal: AbortSignal, notFound?: T): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (response.status === 404 && notFound !== undefined) return notFound;
  if (!response.ok) throw new Error('Не удалось обновить каталог');
  return response.json() as Promise<T>;
}
