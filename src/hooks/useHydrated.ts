"use client";

import { useEffect, useState } from "react";

/**
 * Returns `true` only after the component has mounted on the client.
 * Use to guard rendering of values that differ between server and client
 * (e.g. data from `localStorage`-persisted Zustand stores) so that the
 * first client render matches the SSR output and avoids hydration mismatches.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
