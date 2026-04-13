import { expect, test } from "../fixtures/auth";

test.describe("state history API", () => {
  test("state-rollback endpoint responds on a no-op payload", async ({
    request,
  }) => {
    const res = await request.post("/api/state-rollback", {
      data: {
        deletedMessages: [],
        remainingMessages: [],
        currentStoryState: "",
        turnNumber: 0,
      },
    });

    expect(res.ok()).toBeTruthy();

    const body = (await res.json()) as {
      disposition?: string;
      turnNumber?: number;
    };
    expect(body.disposition).toBe("rollback");
    expect(body.turnNumber).toBe(0);
  });
});
