import { describe, it, expect } from "vitest";
import {
  inferAttributeCategory,
  inferRelationshipTone,
  inferFactTags,
  summarizeFact,
  deriveThreadHook,
  generateStoryItemId,
  normalizeTextKey,
} from "../inference.js";

describe("inferAttributeCategory", () => {
  it('returns "face" for eyes', () => {
    expect(inferAttributeCategory("eyes", "bright blue eyes")).toBe("face");
  });

  it('returns "hair" for hairstyle', () => {
    expect(inferAttributeCategory("hairstyle", "long braid")).toBe("hair");
  });

  it('returns "outfit" for jacket', () => {
    expect(inferAttributeCategory("jacket", "leather jacket")).toBe("outfit");
  });

  it('defaults to "presence" for unknown attribute', () => {
    expect(inferAttributeCategory("unknown", "")).toBe("presence");
  });
});

describe("inferRelationshipTone", () => {
  it('returns "close" for devoted friends', () => {
    expect(inferRelationshipTone("They are close friends, devoted")).toBe(
      "close",
    );
  });

  it('returns "hostile" for hostile enemies', () => {
    expect(inferRelationshipTone("hostile enemies who resent each other")).toBe(
      "hostile",
    );
  });

  it('defaults to "neutral" when no keywords match', () => {
    expect(inferRelationshipTone("some text with no keywords")).toBe("neutral");
  });

  it("applies priority: intimate > close > warm > neutral > cold > hostile", () => {
    // intimate beats close
    expect(inferRelationshipTone("intimate and close")).toBe("intimate");
    // close beats warm
    expect(inferRelationshipTone("close and warm")).toBe("close");
    // warm beats neutral
    expect(inferRelationshipTone("warm and neutral")).toBe("warm");
    // neutral beats cold
    expect(inferRelationshipTone("neutral and cold")).toBe("neutral");
    // cold beats hostile
    expect(inferRelationshipTone("cold and hostile")).toBe("cold");
  });
});

describe("inferFactTags", () => {
  it('includes "spatial" for location text', () => {
    expect(inferFactTags("She lives at 123 Main Street in the city")).toContain(
      "spatial",
    );
  });

  it('defaults to ["event"] when no keywords match', () => {
    expect(inferFactTags("neutral text with no keywords")).toEqual(["event"]);
  });
});

describe("summarizeFact", () => {
  it("returns first clause up to 8 words", () => {
    const result = summarizeFact(
      "She moved to the city last year. It was a big change.",
    );
    expect(result).toBe("She moved to the city last year");
  });

  it('returns "fact" for empty string', () => {
    expect(summarizeFact("")).toBe("fact");
  });
});

describe("deriveThreadHook", () => {
  it("returns first clause up to 7 words", () => {
    const result = deriveThreadHook(
      "They need to resolve their argument about the money.",
    );
    expect(result).toBe("They need to resolve their argument about");
  });

  it('returns "open thread" for empty string', () => {
    expect(deriveThreadHook("")).toBe("open thread");
  });
});

describe("generateStoryItemId", () => {
  it("creates prefixed kebab-case ID", () => {
    expect(generateStoryItemId("thread", "Some description here!")).toBe(
      "thread-some-description-here",
    );
  });
});

describe("normalizeTextKey", () => {
  it("trims and collapses whitespace to lowercase", () => {
    expect(normalizeTextKey("  Hello   World  ")).toBe("hello world");
  });
});
