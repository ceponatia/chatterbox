import { describe, it, expect } from "vitest";
import { defaultMessageProcessing } from "../message-processing";
import type { SocketMessage } from "../types";

function msg(role: "user" | "assistant", i: number): SocketMessage {
  return { id: String(i), role, content: `msg ${i}` };
}

describe("defaultMessageProcessing", () => {
  it("returns all messages when count <= maxMessages", () => {
    const messages = [msg("user", 1), msg("assistant", 2)];
    const result = defaultMessageProcessing.process(messages, 40);
    expect(result.messages).toEqual(messages);
  });

  it("slices to last N messages when count > maxMessages", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", i),
    );
    const result = defaultMessageProcessing.process(messages, 3);
    expect(result.messages).toEqual(messages.slice(-3));
  });

  it("reports correct originalCount and outputCount", () => {
    const messages = Array.from({ length: 10 }, (_, i) => msg("user", i));
    const result = defaultMessageProcessing.process(messages, 5);
    expect(result.originalCount).toBe(10);
    expect(result.outputCount).toBe(5);
  });

  it("historyDigest is always null", () => {
    const result = defaultMessageProcessing.process([msg("user", 1)], 40);
    expect(result.historyDigest).toBeNull();
  });

  it("handles empty array input", () => {
    const result = defaultMessageProcessing.process([], 40);
    expect(result.messages).toEqual([]);
    expect(result.originalCount).toBe(0);
    expect(result.outputCount).toBe(0);
    expect(result.historyDigest).toBeNull();
  });

  it("returns all messages when exactly at limit (40)", () => {
    const messages = Array.from({ length: 40 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", i),
    );
    const result = defaultMessageProcessing.process(messages, 40);
    expect(result.messages).toBe(messages);
    expect(result.messages).toEqual(messages);
    expect(result.outputCount).toBe(40);
  });

  it("returns the original array unchanged when length equals a custom limit", () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", i),
    );
    const result = defaultMessageProcessing.process(messages, 5);
    expect(result.messages).toBe(messages);
    expect(result.messages).toEqual(messages);
    expect(result.originalCount).toBe(5);
    expect(result.outputCount).toBe(5);
  });

  it("respects custom maxMessages parameter", () => {
    const messages = Array.from({ length: 20 }, (_, i) => msg("user", i));
    const result = defaultMessageProcessing.process(messages, 5);
    expect(result.outputCount).toBe(5);
    expect(result.messages).toEqual(messages.slice(-5));
  });

  it("uses default maxMessages of 40 when not specified", () => {
    const messages = Array.from({ length: 50 }, (_, i) => msg("user", i));
    // Call without the second argument to trigger the default
    const result = (
      defaultMessageProcessing as {
        process: (
          messages: readonly SocketMessage[],
          maxMessages?: number,
        ) => ReturnType<typeof defaultMessageProcessing.process>;
      }
    ).process(messages);
    expect(result.outputCount).toBe(40);
    expect(result.originalCount).toBe(50);
  });
});
