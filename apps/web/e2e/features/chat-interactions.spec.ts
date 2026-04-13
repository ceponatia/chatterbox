import { expect, test } from "../fixtures/auth";
import type { Page } from "@playwright/test";
import { mockChatStream, unmockChatStream } from "../helpers/mock-chat-stream";
import { isMobileViewport } from "../helpers/viewport";

async function composer(page: Page) {
  const input = page.getByPlaceholder(/describe your action/i);
  await expect(input).toBeVisible({ timeout: 10_000 });
  // Click to trigger React hydration before interacting.
  await input.click();
  const mobile = isMobileViewport(page);
  return {
    input,
    async submit() {
      // Verify React processed the fill before submitting.
      await expect(input).not.toHaveValue("");
      if (mobile) {
        await page
          .locator('button[type="submit"], [data-testid="send-button"]')
          .click();
      } else {
        await input.press("Enter");
      }
    },
  };
}

test.describe("chat interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder(/describe your action/i)).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await unmockChatStream(page);
  });

  test("multiple messages display in order", async ({ page }) => {
    const chat = await composer(page);

    await mockChatStream(page, {
      content: "First response from the assistant.",
    });

    await chat.input.fill("First message");
    await chat.submit();

    await expect(
      page.getByText("First response from the assistant", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    await unmockChatStream(page);
    await mockChatStream(page, {
      content: "Second response from the assistant.",
    });

    await chat.input.fill("Second message");
    await chat.submit();

    await expect(
      page.getByText("Second response from the assistant", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText("First message", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Second message", { exact: false }),
    ).toBeVisible();
  });

  test("user message appears in the message list", async ({ page }) => {
    const chat = await composer(page);

    await mockChatStream(page, {
      content: "Assistant acknowledges the test message.",
    });

    await chat.input.fill("Test message from user");
    await chat.submit();

    // Wait for the assistant response first (proves the round-trip completed),
    // then verify the user message is also visible.
    await expect(
      page.getByText("Assistant acknowledges", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Test message from user", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
