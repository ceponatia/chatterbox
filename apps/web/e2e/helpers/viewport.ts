import type { Page } from "@playwright/test";

/**
 * Returns true when the page viewport is narrower than the lg breakpoint (1024px),
 * matching the app's Tailwind `lg:hidden` / `lg:flex` responsive split.
 */
export function isMobileViewport(page: Page): boolean {
  const vp = page.viewportSize();
  return !!vp && vp.width < 1024;
}
