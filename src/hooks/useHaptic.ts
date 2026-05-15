"use client";

import { useCallback, useEffect, useRef } from "react";

export type HapticIntensity =
  | "selection" // tiny tick — UI selection / pill toggle
  | "light" // single short tap (5–10 ms)
  | "medium" // a bit more presence (15–25 ms)
  | "heavy" // confirm-strength (35 ms)
  | "success" // double-bump pattern
  | "warning" // medium + pause + medium
  | "error"; // longer triple-pulse

const PATTERNS: Record<HapticIntensity, number | number[]> = {
  selection: 5,
  light: 10,
  medium: 18,
  heavy: 32,
  success: [12, 40, 18],
  warning: [22, 80, 22],
  error: [28, 60, 28, 60, 32],
};

/**
 * Scale a single ms value into the iOS-trick equivalent:
 * we just trigger the synthetic switch click N times for heavier patterns.
 * (iOS gives us only one tier of haptic this way — quantity > intensity.)
 */
const IOS_REPEATS: Record<HapticIntensity, number> = {
  selection: 1,
  light: 1,
  medium: 1,
  heavy: 2,
  success: 2,
  warning: 2,
  error: 3,
};

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPad on iPadOS 13+ reports MacIntel; sniff touch + Mac to catch it.
  const iPad =
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  return /iPhone|iPod|iPad/.test(ua) || iPad;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Cross-platform haptic feedback for PWAs.
 *
 * - **Android / Chrome desktop with vibration motor**: uses `navigator.vibrate`
 *   with a per-intensity ms pattern. Full Web Vibration API support.
 *
 * - **iOS Safari (incl. standalone PWA, iOS 17.4+)**: uses the synthetic
 *   `<label><input type="checkbox" switch></label>` click trick. Apple's
 *   system switch component fires a real OS haptic ("tick") when toggled,
 *   and dispatching a programmatic `click` on its label triggers it
 *   without showing any UI. This is the only way to get tactile feedback
 *   from web on iOS today.
 *
 * - **Older iOS / browsers without either**: silent no-op.
 *
 * Respects `prefers-reduced-motion`.
 */
export function useHaptic() {
  // Lazily-created hidden iOS haptic element — created on first call,
  // reused for the lifetime of the page.
  const iosNodeRef = useRef<HTMLLabelElement | null>(null);

  useEffect(() => {
    return () => {
      if (iosNodeRef.current?.parentNode) {
        iosNodeRef.current.parentNode.removeChild(iosNodeRef.current);
        iosNodeRef.current = null;
      }
    };
  }, []);

  return useCallback((intensity: HapticIntensity = "light") => {
    if (typeof window === "undefined") return;
    if (prefersReducedMotion()) return;

    // 1) Standard Web Vibration API (Android, etc.)
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(PATTERNS[intensity]);
        return;
      } catch {
        // Some browsers throw inside iframes / restricted contexts — fall through.
      }
    }

    // 2) iOS switch-click trick
    if (!isIOS()) return;

    let label = iosNodeRef.current;
    if (!label) {
      label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText =
        "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);pointer-events:none;opacity:0";
      const input = document.createElement("input");
      input.type = "checkbox";
      // The `switch` attribute is the iOS 17.4+ UISwitch primitive.
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosNodeRef.current = label;
    }

    const repeats = IOS_REPEATS[intensity];
    for (let i = 0; i < repeats; i++) {
      // Spread the pulses ~80 ms apart so the user feels distinct ticks.
      const delay = i * 80;
      if (delay === 0) {
        label.click();
      } else {
        window.setTimeout(() => label?.click(), delay);
      }
    }
  }, []);
}
