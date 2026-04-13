import { describe, it, expect } from "vitest";
import { defaultPostResponse } from "../post-response";
import type { PostResponseContext } from "../types";

const CTX: PostResponseContext = {
  assistantMessage: { id: "1", role: "assistant", content: "hi" },
  allMessages: [],
  currentStoryState: "",
  systemPrompt: "",
  turnNumber: 1,
};

describe("defaultPostResponse", () => {
  it("does not throw when called with valid context", () => {
    expect(() => defaultPostResponse.onResponse(CTX)).not.toThrow();
  });

  it("returns undefined", () => {
    const result = defaultPostResponse.onResponse(CTX);
    expect(result).toBeUndefined();
  });
});
