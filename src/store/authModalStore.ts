'use client';

import { create } from 'zustand';

interface AuthModalState {
  open: boolean;
  redirect: string | null;
  /** Prefer register tab when opening (e.g. from walkthrough). */
  preferRegister: boolean;
  initialEmail: string | null;
  openAuth: (opts?: {
    redirect?: string | null;
    preferRegister?: boolean;
    initialEmail?: string | null;
  }) => void;
  closeAuth: () => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  open: false,
  redirect: null,
  preferRegister: false,
  initialEmail: null,
  openAuth: (opts) =>
    set({
      open: true,
      redirect: opts?.redirect ?? null,
      preferRegister: opts?.preferRegister ?? false,
      initialEmail: opts?.initialEmail ?? null,
    }),
  closeAuth: () => set({ open: false, redirect: null, preferRegister: false, initialEmail: null }),
}));
