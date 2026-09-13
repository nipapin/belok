"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { getClientOs, isStandalonePwa, type ClientOs } from "@/lib/clientPlatform";
import { isAnyOverlayOpen, subscribeOverlays } from "@/lib/clientOverlay";
import {
  countBrowserVisit,
  isWalkthroughSeen,
  PWA_DISMISS_KEY,
  PWA_LOGIN_SHOWN_KEY,
  PWA_OPEN_GUIDE_EVENT,
  readStorage,
  writeStorage,
} from "@/lib/pwaInstall";
import type { WalkthroughConfig } from "@/lib/walkthrough";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function pathShowsInterest(pathname: string) {
  return (
    pathname.startsWith("/menu") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/orders")
  );
}

export function usePwaInstall() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);

  const [os, setOs] = useState<ClientOs>("desktop");
  const [standalone, setStandalone] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [visits, setVisits] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const { data: walkthroughData, isLoading: walkthroughLoading } = useQuery({
    queryKey: ["walkthrough"],
    queryFn: () => fetch("/api/walkthrough").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: !authLoading && !user,
  });
  const walkthrough = walkthroughData?.config as WalkthroughConfig | undefined;

  useEffect(() => {
    setOs(getClientOs());
    setStandalone(isStandalonePwa());
    setVisits(countBrowserVisit());
    setDismissed(readStorage(PWA_DISMISS_KEY) === "1");
    setOverlayOpen(isAnyOverlayOpen());
    setReady(true);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setGuideOpen(false);
    };
    const onDisplayMode = () => setStandalone(isStandalonePwa());
    const unsubOverlay = subscribeOverlays(() => setOverlayOpen(isAnyOverlayOpen()));
    const onOpenGuide = () => {
      if (isStandalonePwa()) return;
      setGuideOpen(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(PWA_OPEN_GUIDE_EVENT, onOpenGuide);
    const media = window.matchMedia?.("(display-mode: standalone)");
    media?.addEventListener?.("change", onDisplayMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(PWA_OPEN_GUIDE_EVENT, onOpenGuide);
      media?.removeEventListener?.("change", onDisplayMode);
      unsubOverlay();
    };
  }, []);

  const walkthroughBlocking = Boolean(
    !user &&
      (walkthroughLoading ||
        (walkthrough?.enabled &&
          (walkthrough.slides?.length ?? 0) > 0 &&
          !isWalkthroughSeen(walkthrough.version))),
  );

  const engaged =
    visits >= 2 || pathShowsInterest(pathname) || Boolean(user);

  const canResurfaceAfterLogin = Boolean(
    user && dismissed && readStorage(PWA_LOGIN_SHOWN_KEY) !== user.id,
  );

  const showBanner =
    ready &&
    !standalone &&
    !installed &&
    !overlayOpen &&
    !walkthroughBlocking &&
    !authLoading &&
    engaged &&
    (!dismissed || canResurfaceAfterLogin);

  const canNativeInstall = Boolean(deferredPrompt);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome === "accepted";
  }, [deferredPrompt]);

  const dismissBanner = useCallback(() => {
    writeStorage(PWA_DISMISS_KEY, "1");
    setDismissed(true);
    if (user) writeStorage(PWA_LOGIN_SHOWN_KEY, user.id);
  }, [user]);

  const openGuide = useCallback(() => {
    setGuideOpen(true);
  }, []);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
  }, []);

  return {
    os,
    standalone,
    installed,
    showBanner,
    canNativeInstall,
    guideOpen,
    promptInstall,
    dismissBanner,
    openGuide,
    closeGuide,
  };
}
