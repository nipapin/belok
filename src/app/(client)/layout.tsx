"use client";

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
    <div className="flex min-h-dvh flex-col h-full overflow-y-auto scrollbar-hide">
      <Header />
      <main
        className={
          isAuth
            ? "flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
            : "flex-1 pb-[calc(100px+env(safe-area-inset-bottom,0px))]"
        }
      >
        {children}
      </main>
      {!isAuth && <BottomNav />}
    </div>
  );
}
