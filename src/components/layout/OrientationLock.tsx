"use client";

import { lockPortraitOrientation } from "@/lib/portraitLock";
import { useEffect } from "react";

/**
 * Locks screen to portrait via Screen Orientation API.
 * Retries on rotate, resume, and first user tap (required by some browsers).
 */
export default function OrientationLock() {
  useEffect(() => {
    let gestureBound = false;

    const tryLock = () => {
      void lockPortraitOrientation().then((ok) => {
        document.documentElement.toggleAttribute("data-portrait-locked", ok);
      });
    };

    const onFirstGesture = () => {
      tryLock();
      if (gestureBound) {
        document.removeEventListener("pointerdown", onFirstGesture, true);
        document.removeEventListener("touchstart", onFirstGesture, true);
        gestureBound = false;
      }
    };

    tryLock();

    const onOrientationChange = () => tryLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") tryLock();
    };

    window.addEventListener("orientationchange", onOrientationChange);
    document.addEventListener("visibilitychange", onVisible);

    gestureBound = true;
    document.addEventListener("pointerdown", onFirstGesture, { capture: true, passive: true });
    document.addEventListener("touchstart", onFirstGesture, { capture: true, passive: true });

    const retryTimer = window.setInterval(tryLock, 2000);
    window.setTimeout(() => window.clearInterval(retryTimer), 12000);

    return () => {
      window.removeEventListener("orientationchange", onOrientationChange);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", onFirstGesture, true);
      document.removeEventListener("touchstart", onFirstGesture, true);
      window.clearInterval(retryTimer);
      document.documentElement.removeAttribute("data-portrait-locked");
    };
  }, []);

  return null;
}
