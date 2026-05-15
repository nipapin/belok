"use client";

import AnimatedGradientBackground from "@/components/effects/AnimatedGradientBackground";
import BottomNav from "@/components/layout/BottomNav";
import Header from "@/components/layout/Header";
import PullToRefresh from "@/components/layout/PullToRefresh";
import { useAuthStore } from "@/store/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const orientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    if (typeof orientation?.lock !== "function") return;
    orientation.lock("portrait-primary").catch(() => {
      // iOS Safari and most desktop browsers reject this; silently ignore.
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries(),
      fetchUser(),
    ]);
    router.refresh();
  }, [queryClient, fetchUser, router]);

  return (
    <>
      <AnimatedGradientBackground />
      <div data-mobile-ui className="relative z-10 flex h-full min-h-dvh flex-col overflow-hidden">
        <Header />
        <PullToRefresh
          onRefresh={handleRefresh}
          className="flex-1 min-h-0 pt-[calc(66px+env(safe-area-inset-top,0px))] overflow-y-auto overflow-x-hidden scrollbar-hide pb-[max(94px,env(safe-area-inset-bottom,0px))] px-2"
        >
          {children}
        </PullToRefresh>
        <BottomNav />
      </div>
    </>
  );
}
