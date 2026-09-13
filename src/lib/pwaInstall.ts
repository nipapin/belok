export const PWA_VISIT_COUNT_KEY = "belok-pwa-visits";
export const PWA_VISIT_SESSION_KEY = "belok-pwa-visit-counted";
export const PWA_DISMISS_KEY = "belok-pwa-install-dismissed";
export const PWA_LOGIN_SHOWN_KEY = "belok-pwa-login-shown";
export const PWA_OPEN_GUIDE_EVENT = "belok:open-pwa-guide";
export const WALKTHROUGH_SEEN_KEY = "belok-walkthrough-v1";

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** Count this tab session as one visit, once. */
export function countBrowserVisit(): number {
  if (typeof window === "undefined") return 0;
  if (!readSession(PWA_VISIT_SESSION_KEY)) {
    const next = (parseInt(readStorage(PWA_VISIT_COUNT_KEY) ?? "0", 10) || 0) + 1;
    writeStorage(PWA_VISIT_COUNT_KEY, String(next));
    writeSession(PWA_VISIT_SESSION_KEY, "1");
    return next;
  }
  return parseInt(readStorage(PWA_VISIT_COUNT_KEY) ?? "0", 10) || 0;
}

export function isWalkthroughSeen(version = 1): boolean {
  const raw = readStorage(WALKTHROUGH_SEEN_KEY);
  const parsed = raw ? parseInt(raw, 10) : 0;
  const seen = Number.isFinite(parsed) ? parsed : 0;
  return seen >= version;
}

export function requestPwaGuide() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PWA_OPEN_GUIDE_EVENT));
}
