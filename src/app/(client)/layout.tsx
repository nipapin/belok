"use client";

import MetallicGlitterBackground from "@/components/effects/MetallicGlitterBackground";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import { useAuthStore } from "@/store/authStore";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const pathname = usePathname();
  const isAuth = pathname.startsWith("/auth");

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <>
      <MetallicGlitterBackground />
      <div data-mobile-ui className="relative z-10 flex h-full min-h-dvh flex-col overflow-hidden">
        <Header />
        <main
          className={
            isAuth
              ? "flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
              : "flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide pb-[calc(100px+env(safe-area-inset-bottom,0px))]"
          }
        >
          {children}
        </main>
        {!isAuth && <BottomNav />}
      </div>
    </>
  );
}
