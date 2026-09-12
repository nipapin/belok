'use client';

import { create } from 'zustand';

interface AuthModalState {
  open: boolean;
  redirect: string | null;
  /** Prefer register tab when opening (e.g. from walkthrough). */
  preferRegister: boolean;
  openAuth: (opts?: { redirect?: string | null; preferRegister?: boolean }) => void;
  closeAuth: () => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  open: false,
  redirect: null,
  preferRegister: false,
  openAuth: (opts) =>
    set({
      open: true,
      redirect: opts?.redirect ?? null,
      preferRegister: opts?.preferRegister ?? false,
    }),
  closeAuth: () => set({ open: false, redirect: null, preferRegister: false }),
}));
