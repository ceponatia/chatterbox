import { expect, test } from "../fixtures/auth";

test.describe("settings", () => {
  test("can access settings from the sidebar", async ({ page }) => {
    await page.goto("/");

    const settingsTab = page.getByRole("tab", { name: /settings/i });
    await expect(settingsTab).toBeVisible({ timeout: 10_000 });
    await settingsTab.click();

    await expect(page.getByText(/model settings/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/prompt token budget/i)).toBeVisible();
  });

  test("presets API returns data", async ({ request }) => {
    const res = await request.get("/api/presets");
    expect(res.ok()).toBeTruthy();

    const presets = (await res.json()) as unknown;
    expect(Array.isArray(presets)).toBeTruthy();
  });
});
