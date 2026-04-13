import { expect, test } from "../fixtures/auth";
import { deleteStoryProject } from "../fixtures/data";

test.describe("stories smoke", () => {
  test("stories page loads and shows content", async ({ page }) => {
    await page.goto("/stories");

    await expect(page).toHaveURL(/\/stories$/);
    await expect(
      page.getByRole("heading", { name: /story library/i }),
    ).toBeVisible();
  });

  test("can navigate to create a new story", async ({ page, request }) => {
    await page.goto("/stories");

    const createBtn = page.getByRole("button", { name: /new story/i });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    await expect(page).toHaveURL(/\/stories\/[^/]+$/);

    const projectId = page.url().split("/stories/")[1] ?? "";
    if (projectId) {
      await deleteStoryProject(request, projectId);
    }
  });
});
