import { expect, test } from "../fixtures/auth";
import type { Page } from "@playwright/test";
import { ChatPage } from "../pages/chat-page";
import { mockChatStream, unmockChatStream } from "../helpers/mock-chat-stream";
import { e2eName } from "../fixtures/data";
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

test.describe("message actions", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
    chat = new ChatPage(page);
    await chat.goto();
    // Ensure fresh conversation
    if (await chat.newButton.isVisible({ timeout: 3_000 })) {
      await chat.createNewConversation();
    }
  });

  test.afterEach(async ({ page }) => {
    await unmockChatStream(page);
  });

  test("edit message updates content", async ({ page }) => {
    const c = await composer(page);
    const original = `original-${e2eName("msg")}`;
    const edited = `edited-${e2eName("msg")}`;

    await mockChatStream(page, { content: "Response to original." });
    await c.input.fill(original);
    await c.submit();
    await expect(
      page.getByText("Response to original", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Hover on the user message to reveal action buttons
    const messageBubble = page
      .locator(".group.relative")
      .filter({
        has: page.locator(".app-message-surface", { hasText: original }),
      })
      .first();

    if (isMobileViewport(page)) {
      // Mobile: buttons are visible below the message (lg:hidden div)
      await messageBubble.getByRole("button", { name: "Edit" }).click();
    } else {
      await messageBubble.hover();
      // Click Edit button (desktop toolbar only)
      await messageBubble
        .locator('.app-message-toolbar button[title="Edit"]')
        .click();
    }

    // Fill new text in the edit textarea
    const editTextarea = messageBubble.locator("textarea");
    await editTextarea.fill(edited);

    // Click Save (page-level since the bubble locator may no longer match after text change)
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Verify the message content updated
    await expect(page.getByText(edited, { exact: false })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(original)).not.toBeVisible();
  });

  test("delete message removes it from list", async ({ page }) => {
    const c = await composer(page);
    const msg1 = `keep-${e2eName("msg")}`;
    const msg2 = `delete-${e2eName("msg")}`;

    await mockChatStream(page, { content: "First response." });
    await c.input.fill(msg1);
    await c.submit();
    await expect(
      page.getByText("First response", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    await unmockChatStream(page);
    await mockChatStream(page, { content: "Second response." });
    await c.input.fill(msg2);
    await c.submit();
    await expect(
      page.getByText("Second response", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Delete the second user message (two-click confirm)
    const targetBubble = page
      .locator(".group.relative")
      .filter({ has: page.locator(".app-message-surface", { hasText: msg2 }) })
      .first();

    if (isMobileViewport(page)) {
      // Mobile: ConfirmDeleteButton is in the lg:hidden div, still uses title attrs.
      // Use :visible to avoid matching the CSS-hidden desktop toolbar copy.
      await targetBubble.locator('button[title="Delete"]:visible').click();
      await targetBubble
        .locator('button[title="Click again to delete"]:visible')
        .click();
    } else {
      await targetBubble.hover();
      // First click shows confirm state, second click executes
      await targetBubble
        .locator('.app-message-toolbar button[title="Delete"]')
        .click();
      await targetBubble
        .locator('.app-message-toolbar button[title="Click again to delete"]')
        .click();
    }

    // Verify deleted message is gone but first message remains
    await expect(page.getByText(msg2)).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(msg1, { exact: false })).toBeVisible();
  });

  test("delete after truncates later messages", async ({ page }) => {
    const c = await composer(page);
    const msg1 = `first-${e2eName("msg")}`;
    const msg2 = `second-${e2eName("msg")}`;
    const msg3 = `third-${e2eName("msg")}`;

    // Send three messages with responses
    await mockChatStream(page, { content: "Response one." });
    await c.input.fill(msg1);
    await c.submit();
    await expect(page.getByText("Response one", { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    await unmockChatStream(page);
    await mockChatStream(page, { content: "Response two." });
    await c.input.fill(msg2);
    await c.submit();
    await expect(page.getByText("Response two", { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    await unmockChatStream(page);
    await mockChatStream(page, { content: "Response three." });
    await c.input.fill(msg3);
    await c.submit();
    await expect(
      page.getByText("Response three", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await unmockChatStream(page);

    // Use "Delete all after" on the first user message (two-click confirm)
    const firstBubble = page
      .locator(".group.relative")
      .filter({ has: page.locator(".app-message-surface", { hasText: msg1 }) })
      .first();

    if (isMobileViewport(page)) {
      await firstBubble
        .locator('button[title="Delete all after"]:visible')
        .click();
      await firstBubble
        .locator('button[title="Click again to delete all after"]:visible')
        .click();
    } else {
      await firstBubble.hover();
      await firstBubble
        .locator('.app-message-toolbar button[title="Delete all after"]')
        .click();
      await firstBubble
        .locator(
          '.app-message-toolbar button[title="Click again to delete all after"]',
        )
        .click();
    }

    // Second and third messages should be gone
    await expect(page.getByText(msg2)).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(msg3)).not.toBeVisible();
    // First message should remain
    await expect(page.getByText(msg1, { exact: false })).toBeVisible();
  });

  test("retry generates new response", async ({ page }) => {
    const c = await composer(page);

    await mockChatStream(page, { content: "Original assistant response." });
    await c.input.fill("Test retry message");
    await c.submit();
    await expect(
      page.getByText("Original assistant response", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Set up new mock for the retry
    await unmockChatStream(page);
    await mockChatStream(page, { content: "Retried assistant response." });

    // Hover on the assistant message and click Retry
    const assistantBubble = page
      .locator(".group.relative")
      .filter({ hasText: "Original assistant response" })
      .first();

    if (isMobileViewport(page)) {
      await assistantBubble.getByRole("button", { name: "Regenerate" }).click();
    } else {
      await assistantBubble.hover();
      await assistantBubble.locator('button[title="Retry"]').click();
    }

    // Verify new response appears
    await expect(
      page.getByText("Retried assistant response", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("stop button halts streaming", async ({ page }) => {
    // Use a slow mock that delays before responding
    await mockChatStream(page, {
      content: "This should be interrupted.",
      chunkDelay: 10_000,
    });

    const c = await composer(page);
    await c.input.fill("Trigger slow response");
    await c.submit();

    // The stop button (Square icon, destructive variant) should appear
    await expect(chat.stopButton).toBeVisible({ timeout: 5_000 });

    // Click stop
    await chat.clickStop();

    // The input should become available again (stop button gone)
    await expect(chat.stopButton).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder(/describe your action/i)).toBeEnabled();
  });

  test("multi-line message preserves line breaks", async ({ page }) => {
    const c = await composer(page);
    const line1 = `Line1-${e2eName("ml")}`;
    const line2 = `Line2-${e2eName("ml")}`;

    await mockChatStream(page, { content: "Acknowledged multi-line." });

    // Type first line, Shift+Enter for newline, then second line
    await c.input.fill("");
    await c.input.pressSequentially(line1);
    await page.keyboard.press("Shift+Enter");
    await c.input.pressSequentially(line2);
    await c.submit();

    await expect(
      page.getByText("Acknowledged multi-line", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Verify both lines are visible (whitespace-pre-wrap preserves newlines)
    await expect(page.getByText(line1, { exact: false })).toBeVisible();
    await expect(page.getByText(line2, { exact: false })).toBeVisible();
  });
});
