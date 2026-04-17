'use client';

import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import { useAuthStore } from '@/store/authStore';
import { useEffect } from 'react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <div className="flex min-h-dvh flex-col px-4">
      <Header />
      <main className="flex-1 pb-[calc(100px+env(safe-area-inset-bottom,0px))]">{children}</main>
      <BottomNav />
    </div>
  );
}
