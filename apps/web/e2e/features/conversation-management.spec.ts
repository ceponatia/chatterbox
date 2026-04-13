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

test.describe("conversation management", () => {
  test.afterEach(async ({ page }) => {
    await unmockChatStream(page);
  });

  test("conversation drawer opens and shows list", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();
    await chat.openDrawer();
    // The drawer dialog should contain the visible "Conversations" heading
    const dialog = page.locator('[role="dialog"]');
    await expect(
      dialog.locator("span").filter({ hasText: "Conversations" }),
    ).toBeVisible();
  });

  test("create new conversation clears chat", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();
    const c = await composer(page);

    // Send a message first to have content
    await mockChatStream(page, { content: "Response in first conversation." });
    await c.input.fill("First conv message");
    await c.submit();
    await expect(
      page.getByText("Response in first conversation", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Click New to create a fresh conversation
    await unmockChatStream(page);
    await chat.createNewConversation();

    // Verify the chat is now empty (first conv message gone)
    await expect(page.getByText("First conv message")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("switch between conversations", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();
    const c = await composer(page);

    // Send a message in the first conversation
    const msg1 = `Alpha-${e2eName("msg")}`;
    await mockChatStream(page, { content: "Alpha response." });
    await c.input.fill(msg1);
    await c.submit();
    await expect(
      page.getByText("Alpha response", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Create new conversation and send a different message
    await unmockChatStream(page);
    await chat.createNewConversation();
    const c2 = await composer(page);
    const msg2 = `Beta-${e2eName("msg")}`;
    await mockChatStream(page, { content: "Beta response." });
    await c2.input.fill(msg2);
    await c2.submit();
    await expect(page.getByText("Beta response", { exact: false })).toBeVisible(
      { timeout: 15_000 },
    );

    // Switch back to first conversation via drawer
    await unmockChatStream(page);
    await chat.switchConversation(msg1);

    // Verify the first conversation's message is visible again
    await expect(page.getByText(msg1, { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(msg2, { exact: false })).not.toBeVisible();
  });

  test("delete conversation from drawer", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto();
    const c = await composer(page);

    // Send a message to create a conversation
    const uniqueMsg = `delete-me-${e2eName("msg")}`;
    await mockChatStream(page, { content: "Doomed response." });
    await c.input.fill(uniqueMsg);
    await c.submit();
    await expect(
      page.getByText("Doomed response", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await unmockChatStream(page);

    // Create a second conversation so we have something to fall back to
    await chat.createNewConversation();

    // Open drawer and locate the conversation we want to delete by its unique title
    await chat.openDrawer();
    const dialog = page.locator('[role="dialog"]');
    const targetItem = chat.findConversationItem(uniqueMsg);
    await targetItem.scrollIntoViewIfNeeded();
    await targetItem.hover();

    // ConfirmDeleteButton: first click arms, second click confirms
    await targetItem.locator('button[title="Delete"]').click();
    // After first click the title changes to "Click again to delete"
    await targetItem.locator('button[title="Click again to delete"]').click();

    // Verify the conversation is no longer in the drawer
    await expect(dialog.getByText(uniqueMsg)).not.toBeVisible({
      timeout: 5_000,
    });
  });
});
