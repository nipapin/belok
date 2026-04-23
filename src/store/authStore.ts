'use client';

import { create } from 'zustand';

interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  bonusBalance: number;
  totalSpent: number;
  loyaltyLevel: {
    id: string;
    name: string;
    cashbackPercent: number;
    discountPercent: number;
  } | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const authFetch = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, credentials: 'include' });

let fetchUserInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user, isLoading: false }),

  fetchUser: async () => {
    if (fetchUserInFlight) {
      return fetchUserInFlight;
    }
    fetchUserInFlight = (async () => {
      try {
        const res = await authFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          set({ user: data.user, isLoading: false });
          return;
        }

        const refreshRes = await authFetch('/api/auth/refresh', { method: 'POST' });
        if (refreshRes.ok) {
          const meRes = await authFetch('/api/auth/me');
          if (meRes.ok) {
            const data = await meRes.json();
            set({ user: data.user, isLoading: false });
            return;
          }
        }

        await authFetch('/api/auth/logout', { method: 'POST' });
        set({ user: null, isLoading: false });
      } catch {
        set({ user: null, isLoading: false });
      } finally {
        fetchUserInFlight = null;
      }
    })();
    return fetchUserInFlight;
  },

  logout: async () => {
    await authFetch('/api/auth/logout', { method: 'POST' });
    set({ user: null });
  },
}));
