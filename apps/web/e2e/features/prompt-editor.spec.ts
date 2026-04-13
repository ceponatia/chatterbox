import { expect, test } from "../fixtures/auth";
import {
  createStoryProject,
  deleteStoryProject,
  e2eName,
} from "../fixtures/data";

test.describe("prompt editor", () => {
  let projectId = "";

  test.beforeAll(async ({ request }) => {
    const result = await createStoryProject(request, e2eName("prompt"));
    projectId = result.id;
  });

  test.afterAll(async ({ request }) => {
    if (projectId) {
      await deleteStoryProject(request, projectId);
    }
  });

  test("story editor loads with tabs", async ({ page }) => {
    await page.goto(`/stories/${projectId}`);

    const tabs = page.getByRole("tab");
    await expect(tabs.first()).toBeVisible({ timeout: 10_000 });
    expect(await tabs.count()).toBeGreaterThanOrEqual(2);

    await expect(page.getByRole("tab", { name: /overview/i })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /system prompt/i }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /characters/i })).toBeVisible();
  });
});
