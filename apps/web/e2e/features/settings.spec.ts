import { expect, test } from "../fixtures/auth";
import { isMobileViewport } from "../helpers/viewport";

test.describe("settings", () => {
  test("can access settings from the sidebar", async ({ page }) => {
    await page.goto("/");

    if (isMobileViewport(page)) {
      // On mobile, the sidebar is behind a full-screen overlay.
      // Click the Config button to open it first.
      const configToggle = page
        .getByRole("button", { name: /config/i })
        .first();
      await expect(configToggle).toBeVisible({ timeout: 10_000 });
      await configToggle.click();
      await page
        .locator('[role="dialog"].app-mobile-overlay')
        .waitFor({ timeout: 5_000 });
    }

    // On mobile the overlay duplicates the sidebar DOM, so scope assertions
    // to the visible dialog to avoid strict-mode violations.
    const scope = isMobileViewport(page)
      ? page.locator('[role="dialog"].app-mobile-overlay')
      : page;

    const settingsTab = scope.getByRole("tab", { name: /settings/i });
    await expect(settingsTab).toBeVisible({ timeout: 10_000 });
    await settingsTab.click();

    await expect(scope.getByText(/model settings/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(scope.getByText(/prompt token budget/i)).toBeVisible();
  });

  test("presets API returns data", async ({ request }) => {
    const res = await request.get("/api/presets");
    expect(res.ok()).toBeTruthy();

    const presets = (await res.json()) as unknown;
    expect(Array.isArray(presets)).toBeTruthy();
  });
});
