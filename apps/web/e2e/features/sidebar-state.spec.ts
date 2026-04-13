import { expect, test } from "../fixtures/auth";
import type { Page } from "@playwright/test";
import { isMobileViewport } from "../helpers/viewport";

async function isSettingsTabVisible(page: Page) {
  return page
    .getByRole("tab", { name: /settings/i })
    .isVisible()
    .catch(() => false);
}

test.describe("sidebar state", () => {
  test("config sidebar can be toggled", async ({ page }) => {
    await page.goto("/");

    const configToggle = page.getByRole("button", { name: /config/i }).first();
    await expect(configToggle).toBeVisible({ timeout: 10_000 });

    if (isMobileViewport(page)) {
      // Mobile: Config opens a full-screen overlay dialog.
      // First click opens it; Escape closes it.
      await configToggle.click();
      const overlay = page.locator('[role="dialog"].app-mobile-overlay');
      await overlay.waitFor({ timeout: 5_000 });
      await expect(page.getByRole("tab", { name: /settings/i })).toBeVisible();

      // Close via Escape (the overlay has a keydown handler)
      await page.keyboard.press("Escape");
      await overlay.waitFor({ state: "hidden", timeout: 5_000 });
      await expect(
        page.getByRole("tab", { name: /settings/i }),
      ).not.toBeVisible();
    } else {
      const visibleBefore = await isSettingsTabVisible(page);
      await configToggle.click();
      await expect
        .poll(() => isSettingsTabVisible(page))
        .not.toBe(visibleBefore);

      await configToggle.click();
      await expect.poll(() => isSettingsTabVisible(page)).toBe(visibleBefore);
    }
  });
});
