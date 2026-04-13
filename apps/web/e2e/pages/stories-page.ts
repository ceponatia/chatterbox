import type { Locator, Page } from "@playwright/test";

export class StoriesPage {
  readonly page: Page;
  readonly projectList: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.projectList = page.locator(
      '[data-testid="project-list"], .project-list, main',
    );
    this.createButton = page.getByRole("button", { name: /new|create/i });
  }

  async goto() {
    await this.page.goto("/stories");
  }

  async getProjectCards() {
    return this.projectList
      .locator('[data-testid="project-card"], a[href*="/stories/"]')
      .all();
  }
}
