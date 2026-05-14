"use client";

import MetallicGlitterBackground from "@/components/effects/MetallicGlitterBackground";
import BottomNav from "@/components/layout/BottomNav";
import Header from "@/components/layout/Header";
import { useAuthStore } from "@/store/authStore";
import { useEffect } from "react";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <>
      <MetallicGlitterBackground />
      <div data-mobile-ui className="relative z-10 flex h-full min-h-dvh flex-col overflow-hidden">
        <Header />
        <main className="flex-1 min-h-0 pt-[66px] overflow-y-auto overflow-x-hidden scrollbar-hide pb-[max(94px,env(safe-area-inset-bottom,0px))] px-2">
          {children}
        </main>
        <BottomNav />
      </div>
    </>
  );
}
