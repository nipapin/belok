"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Returns `true` only after the component has mounted on the client.
 * Use to guard rendering of values that differ between server and client
 * (e.g. data from `localStorage`-persisted Zustand stores) so that the
 * first client render matches the SSR output and avoids hydration mismatches.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
