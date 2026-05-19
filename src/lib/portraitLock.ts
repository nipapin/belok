/** Installed PWA (home screen / standalone), not a regular browser tab. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  if (
    "standalone" in navigator &&
    (navigator as Navigator & { standalone?: boolean }).standalone
  ) {
    return true;
  }
  return window.matchMedia("(display-mode: standalone)").matches;
}

type OrientableScreen = ScreenOrientation & { lock?: (o: string) => Promise<void> };

function getOrientableScreen(): OrientableScreen | undefined {
  return window.screen?.orientation as OrientableScreen | undefined;
}

export function isPortraitLockApiAvailable(): boolean {
  return typeof getOrientableScreen()?.lock === "function";
}

/**
 * OS-level portrait lock. Works in installed PWA and some Android builds.
 * Regular Safari/Chrome tabs often reject this (browser security policy).
 */
export async function lockPortraitOrientation(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const orientation = getOrientableScreen();
  const lock = orientation?.lock;
  if (typeof lock !== "function") return false;

  try {
    await lock.call(orientation, "portrait-primary");
    return true;
  } catch {
    try {
      await lock.call(orientation, "portrait");
      return true;
    } catch {
      return false;
    }
  }
}
