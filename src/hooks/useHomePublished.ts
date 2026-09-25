'use client';

import { useQuery } from '@tanstack/react-query';

export function useHomePublished() {
  const query = useQuery({
    queryKey: ['home-published'],
    queryFn: () =>
      fetch('/api/home-published').then((r) => r.json()) as Promise<{ published?: boolean }>,
    staleTime: 15_000,
  });

  return {
    published: query.data?.published === true,
    isLoading: query.isLoading,
  };
}
