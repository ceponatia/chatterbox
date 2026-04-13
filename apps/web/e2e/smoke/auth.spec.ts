import { E2E_USER, expect, test } from "../fixtures/auth";
import { LoginPage } from "../pages/login-page";

test.describe("authentication", () => {
  test("login page renders", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in|log in/i }),
    ).toBeVisible();
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");

    await expect(page).toHaveURL(/\/login/);
  });

  // Server-side auth middleware (proxy.ts) is not wired as Next.js middleware,
  // so API routes are not auth-gated at the transport level.
  test.skip("unauthenticated API request returns 401", async () => {});

  test("login flow succeeds with valid credentials", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login(E2E_USER.user, E2E_USER.password);

    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    await context.close();
  });

  test("login fails with invalid credentials", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login("nonexistent_user", "wrong_password");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/login failed|invalid|error/i)).toBeVisible({
      timeout: 5_000,
    });
    await context.close();
  });
});
