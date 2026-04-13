import { expect, test } from "../fixtures/auth";

test.describe("navigation smoke", () => {
  test("root page loads the chat interface", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.getByPlaceholder(/describe your action/i)).toBeVisible();
  });

  test("stories page loads", async ({ page }) => {
    await page.goto("/stories");

    await expect(page).toHaveURL(/\/stories$/);
    await expect(
      page.getByRole("heading", { name: /story library/i }),
    ).toBeVisible();
  });

  test("unknown route shows 404", async ({ page }) => {
    const res = await page.goto("/nonexistent-route-xyz");

    expect(res?.status()).toBe(404);
  });
});
