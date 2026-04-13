import type { Locator, Page } from "@playwright/test";

export class ChatPage {
  readonly page: Page;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messageList: Locator;
  readonly conversationDrawerToggle: Locator;
  readonly stopButton: Locator;
  readonly newButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.messageInput = page.locator(
      'textarea[placeholder*="message" i], input[placeholder*="message" i], [data-testid="chat-input"]',
    );
    this.sendButton = page.locator(
      'button[type="submit"], [data-testid="send-button"]',
    );
    this.messageList = page.locator(
      '[data-testid="message-list"], .message-list, [role="log"]',
    );
    this.conversationDrawerToggle = page.getByTitle("Conversations");
    this.stopButton = page.locator("button:has(svg.lucide-square)");
    this.newButton = page.getByRole("button", { name: "New" });
  }

  async goto() {
    await this.page.goto("/");
  }

  async sendMessage(text: string) {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  async getMessages() {
    return this.messageList.locator('[data-testid="message"], .message').all();
  }

  async waitForAssistantResponse() {
    await this.page.waitForSelector(
      '[data-role="assistant"], [data-testid="assistant-message"]',
      { timeout: 10_000 },
    );
  }

  /** The Sheet dialog element when the drawer is open. */
  private get drawerDialog() {
    return this.page.locator('[role="dialog"]');
  }

  /** Open the conversation drawer (Sheet) via the header toggle. */
  async openDrawer() {
    await this.conversationDrawerToggle.click();
    await this.drawerDialog.waitFor({ timeout: 5_000 });
  }

  /** Close the drawer by pressing Escape. */
  async closeDrawer() {
    await this.page.keyboard.press("Escape");
  }

  /** Return all conversation item wrappers (.group.relative) inside the drawer. */
  async getConversationItems(): Promise<Locator[]> {
    return this.drawerDialog.locator(".group.relative").all();
  }

  /** Find a specific conversation item in the open drawer by title text. */
  findConversationItem(titleText: string): Locator {
    return this.drawerDialog
      .locator(".group.relative")
      .filter({ hasText: titleText })
      .first();
  }

  /** Open drawer and click the conversation whose title includes `title`. */
  async switchConversation(title: string) {
    await this.openDrawer();
    const item = this.findConversationItem(title);
    await item.scrollIntoViewIfNeeded();
    await item.locator("button").first().click();
    // Close the drawer so subsequent assertions aren't affected by drawer content
    await this.drawerDialog
      .waitFor({ state: "hidden", timeout: 3_000 })
      .catch(() => this.closeDrawer());
  }

  /** Click the "New" header button to create a fresh conversation. */
  async createNewConversation() {
    await this.newButton.click();
    // Brief wait for the new conversation to initialize
    await this.page.waitForTimeout(500);
  }

  // -- Message actions --

  /**
   * Locate the outer message wrapper (.group.relative) that contains
   * an .app-message-surface with the given text.  Using the outer wrapper
   * ensures hovering activates the group-hover toolbar.
   */
  private messageBubble(messageText: string): Locator {
    return this.page
      .locator(".group.relative")
      .filter({
        has: this.page.locator(".app-message-surface", {
          hasText: messageText,
        }),
      })
      .first();
  }

  /** Desktop-only toolbar button inside a message bubble. */
  private toolbarButton(bubble: Locator, title: string): Locator {
    return bubble.locator(`.app-message-toolbar button[title="${title}"]`);
  }

  /** Edit a user message: hover, click Edit, fill new text, click Save. */
  async editMessage(messageText: string, newText: string) {
    const bubble = this.messageBubble(messageText);
    await bubble.hover();
    await this.toolbarButton(bubble, "Edit").click();
    // After clicking Edit, a textarea appears inside the bubble
    const textarea = bubble.locator("textarea");
    await textarea.fill(newText);
    // After filling, the original text is gone so the bubble locator may not match.
    // Use a page-level selector for the Save button (only one edit form open at a time).
    await this.page.getByRole("button", { name: "Save", exact: true }).click();
  }

  /** Delete a single message (two-click confirm). */
  async deleteMessage(messageText: string) {
    const bubble = this.messageBubble(messageText);
    await bubble.hover();
    await this.toolbarButton(bubble, "Delete").click();
    await this.toolbarButton(bubble, "Click again to delete").click();
  }

  /** Delete all messages after the given message (two-click confirm). */
  async deleteAfter(messageText: string) {
    const bubble = this.messageBubble(messageText);
    await bubble.hover();
    await this.toolbarButton(bubble, "Delete all after").click();
    await this.toolbarButton(bubble, "Click again to delete all after").click();
  }

  /** Retry the last assistant message. */
  async retryLastMessage() {
    const assistantBubbles = this.page.locator(
      ".group.relative:has(.app-message-avatar-assistant)",
    );
    const last = assistantBubbles.last();
    await last.hover();
    await last.locator('.app-message-toolbar button[title="Retry"]').click();
  }

  /** Click the stop button (visible while streaming). */
  async clickStop() {
    await this.stopButton.click();
  }
}
