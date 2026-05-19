/** Top stop of `--lg-bg-image` — used for iOS/Android status bar & PWA chrome. */
export const PWA_THEME_COLOR = {
  dark: "#bacef0",
  light: "#e8eef7",
} as const;

export type AppTheme = keyof typeof PWA_THEME_COLOR;

export function applyPwaThemeColor(theme: AppTheme) {
  if (typeof document === "undefined") return;
  const color = PWA_THEME_COLOR[theme];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}
