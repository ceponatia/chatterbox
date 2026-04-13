import { expect, test } from "../fixtures/auth";
import {
  createStoryProject,
  deleteStoryProject,
  e2eName,
} from "../fixtures/data";

test.describe("story projects", () => {
  let projectId = "";
  let projectName = "";

  test.beforeEach(async ({ request }) => {
    projectName = e2eName("story");
    const result = await createStoryProject(request, projectName);
    projectId = result.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await deleteStoryProject(request, projectId);
    }
  });

  test("created project appears in story list", async ({ page }) => {
    await page.goto("/stories");

    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  test("can navigate into a story project", async ({ page }) => {
    await page.goto("/stories");

    // Find the card containing the project name, then click its "Open" button.
    const card = page.locator("article, [class*=card], div").filter({
      hasText: projectName,
    });
    await card
      .getByRole("button", { name: /open/i })
      .or(card.getByRole("link", { name: /open/i }))
      .first()
      .click();

    await expect(page).toHaveURL(new RegExp(`/stories/${projectId}$`), {
      timeout: 10_000,
    });
    await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });
  });

  test("can delete a story project via API", async ({ request }) => {
    const res = await request.delete(`/api/story-projects/${projectId}`);

    expect(res.ok()).toBeTruthy();
    projectId = "";
  });

  test("story project CRUD via API", async ({ request }) => {
    const getRes = await request.get(`/api/story-projects/${projectId}`);
    expect(getRes.ok()).toBeTruthy();

    const project = (await getRes.json()) as { id: string; name: string };
    expect(project.name).toBe(projectName);

    const newName = e2eName("updated");
    const putRes = await request.put(`/api/story-projects/${projectId}`, {
      data: { name: newName },
    });
    expect(putRes.ok()).toBeTruthy();

    const verifyRes = await request.get(`/api/story-projects/${projectId}`);
    const updated = (await verifyRes.json()) as { name: string };
    expect(updated.name).toBe(newName);
  });
});
