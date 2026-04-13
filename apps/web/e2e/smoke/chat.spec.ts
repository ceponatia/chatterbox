import { expect, test } from "../fixtures/auth";
import type { Page } from "@playwright/test";
import { mockChatStream, unmockChatStream } from "../helpers/mock-chat-stream";
import { isMobileViewport } from "../helpers/viewport";

async function sendChatMessage(page: Page, text: string) {
  const input = page.getByPlaceholder(/describe your action/i);
  await expect(input).toBeVisible({ timeout: 10_000 });
  // Click to trigger React hydration before interacting.
  await input.click();
  await input.fill(text);
  await expect(input).toHaveValue(text);
  if (isMobileViewport(page)) {
    await page
      .locator('button[type="submit"], [data-testid="send-button"]')
      .click();
  } else {
    await input.press("Enter");
  }
}

test.describe("chat smoke", () => {
  test.afterEach(async ({ page }) => {
    await unmockChatStream(page);
  });

  test("chat interface renders with input area", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByPlaceholder(/describe your action/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("sending a message triggers the chat request", async ({ page }) => {
    await page.goto("/");

    const routes = await mockChatStream(page, {
      content: "Hello! This is a mocked assistant response.",
    });

    await sendChatMessage(page, "Hello, this is a test message");

    await expect.poll(() => routes.length).toBe(1);
    await expect(
      page.getByText("mocked assistant response", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
