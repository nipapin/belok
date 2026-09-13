export type ClientOs = "ios" | "android" | "desktop";

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPad =
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  return /iPhone|iPod|iPad/.test(ua) || iPad;
}

export function getClientOs(): ClientOs {
  if (typeof navigator === "undefined") return "desktop";
  if (isIosDevice()) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

export { isStandalonePwa } from "./portraitLock";
