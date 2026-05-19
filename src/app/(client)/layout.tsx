"use client";

import AnimatedGradientBackground from "@/components/effects/AnimatedGradientBackground";
import BottomNav from "@/components/layout/BottomNav";
import Header from "@/components/layout/Header";
import PullToRefresh from "@/components/layout/PullToRefresh";
import UpdateToast from "@/components/layout/UpdateToast";
import PushPromptAfterRegister from "@/components/notifications/PushPromptAfterRegister";
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

  const handleRefresh = useCallback(async () => {
    await Promise.all([queryClient.invalidateQueries(), fetchUser()]);
    router.refresh();
  }, [queryClient, fetchUser, router]);

  return (
    <>
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <AnimatedGradientBackground />
        <div data-mobile-ui className="relative z-10 flex min-h-0 flex-1 flex-col">
          <Header />
          <PullToRefresh
            onRefresh={handleRefresh}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-hide px-2 pt-[var(--client-header-stack-height)] pb-[calc(var(--client-nav-bar-height)+var(--client-nav-edge-gap))]"
          >
            {children}
          </PullToRefresh>
        </div>
        <BottomNav />
      </div>
      <UpdateToast />
      <PushPromptAfterRegister />
    </>
  );
}
