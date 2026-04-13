import { expect, test } from "../fixtures/auth";
import type { Page } from "@playwright/test";

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

    const visibleBefore = await isSettingsTabVisible(page);
    await configToggle.click();
    await expect.poll(() => isSettingsTabVisible(page)).not.toBe(visibleBefore);

    await configToggle.click();
    await expect.poll(() => isSettingsTabVisible(page)).toBe(visibleBefore);
  });
});
