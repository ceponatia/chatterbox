import type { Locator, Page } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByLabel(/username/i);
    this.passwordInput = page.getByLabel(/^password$/i);
    this.submitButton = page.getByRole("button", {
      name: /log in|sign in|submit/i,
    });
    this.errorMessage = page.locator(
      '[role="alert"], .error, [data-testid="error"]',
    );
  }

  async goto() {
    await this.page.goto("/login");
  }

  async login(user: string, password: string) {
    await this.usernameInput.fill(user);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
