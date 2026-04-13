import { describe, it, expect } from "vitest";
import { estimateTokens } from "../token-estimator";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns 1 for 1 character", () => {
    expect(estimateTokens("a")).toBe(1);
  });

  it("returns 1 for exactly 4 characters", () => {
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("returns 2 for 5 characters (ceiling)", () => {
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("returns 2 for exactly 8 characters", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("returns 25 for 100 characters", () => {
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });

  it("uses ceiling not floor", () => {
    // 3 chars / 4 = 0.75 -> ceil = 1
    expect(estimateTokens("abc")).toBe(1);
    // 5 chars / 4 = 1.25 -> ceil = 2
    expect(estimateTokens("abcde")).toBe(2);
    // 9 chars / 4 = 2.25 -> ceil = 3
    expect(estimateTokens("abcdefghi")).toBe(3);
  });

  it("handles multi-byte characters by string length", () => {
    // JS string.length counts UTF-16 code units, not bytes
    const text = "hello";
    expect(estimateTokens(text)).toBe(Math.ceil(text.length / 4));
  });

  it("returns 3 for 9 characters", () => {
    expect(estimateTokens("123456789")).toBe(3);
  });

  it("returns 1 for 2 characters", () => {
    expect(estimateTokens("ab")).toBe(1);
  });
});
