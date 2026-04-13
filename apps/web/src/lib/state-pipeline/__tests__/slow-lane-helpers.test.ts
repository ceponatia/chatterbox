/**
 * Tests for the pure helper functions exported from slow-lane-socket.ts.
 */

import { describe, it, expect } from "vitest";
import {
  parseSlowLaneResponse,
  normalizeDecisions,
  normalizeSupersessions,
  normalizeThreadReconciliations,
  applyPromotedFacts,
} from "../slow-lane-socket.js";
import type { RawSlowLaneResponse } from "../slow-lane-socket.js";

// ---------------------------------------------------------------------------
// parseSlowLaneResponse
// ---------------------------------------------------------------------------

describe("parseSlowLaneResponse", () => {
  it("parses valid JSON object", () => {
    const result = parseSlowLaneResponse('{"candidateDecisions": []}');
    expect(result).toEqual({ candidateDecisions: [] });
  });

  it("strips ```json fences and parses", () => {
    const fenced =
      '```json\n{"candidateDecisions": [], "summary": "done"}\n```';
    const result = parseSlowLaneResponse(fenced);
    expect(result).toEqual({ candidateDecisions: [], summary: "done" });
  });

  it("strips ``` fences without language tag", () => {
    const fenced = '```\n{"supersessions": []}\n```';
    const result = parseSlowLaneResponse(fenced);
    expect(result).toEqual({ supersessions: [] });
  });

  it("returns null for invalid JSON", () => {
    expect(parseSlowLaneResponse("not json at all")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSlowLaneResponse("")).toBeNull();
  });

  it("handles whitespace-padded JSON", () => {
    const result = parseSlowLaneResponse('  \n  {"summary": "ok"}  \n  ');
    expect(result).toEqual({ summary: "ok" });
  });

  it("parses a full response with all fields", () => {
    const full = JSON.stringify({
      candidateDecisions: [
        { candidateId: "cf-1", verdict: "promoted", detail: "valid fact" },
      ],
      supersessions: [
        { existingFactSnippet: "old fact", supersededBy: "new fact" },
      ],
      threadReconciliations: [
        { threadSnippet: "thread desc", action: "resolve", rationale: "done" },
      ],
      summary: "Reconciliation complete",
    });
    const result = parseSlowLaneResponse(full);
    expect(result).not.toBeNull();
    expect(result!.candidateDecisions).toHaveLength(1);
    expect(result!.supersessions).toHaveLength(1);
    expect(result!.threadReconciliations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// normalizeDecisions
// ---------------------------------------------------------------------------

describe("normalizeDecisions", () => {
  const candidateIds = new Set(["cf-1", "cf-2", "cf-3"]);

  it("keeps promoted verdict", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [
        { candidateId: "cf-1", verdict: "promoted", detail: "good" },
      ],
    };
    const decisions = normalizeDecisions(raw, candidateIds);
    const d1 = decisions.find((d) => d.candidateId === "cf-1");
    expect(d1!.verdict).toBe("promoted");
    expect(d1!.detail).toBe("good");
  });

  it("keeps rejected verdict", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [{ candidateId: "cf-1", verdict: "rejected" }],
    };
    const decisions = normalizeDecisions(raw, candidateIds);
    expect(decisions.find((d) => d.candidateId === "cf-1")!.verdict).toBe(
      "rejected",
    );
  });

  it("keeps retained verdict", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [{ candidateId: "cf-2", verdict: "retained" }],
    };
    const decisions = normalizeDecisions(raw, candidateIds);
    expect(decisions.find((d) => d.candidateId === "cf-2")!.verdict).toBe(
      "retained",
    );
  });

  it("defaults unknown verdict to retained", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [{ candidateId: "cf-1", verdict: "unknown_verdict" }],
    };
    const decisions = normalizeDecisions(raw, candidateIds);
    expect(decisions.find((d) => d.candidateId === "cf-1")!.verdict).toBe(
      "retained",
    );
  });

  it("defaults missing verdict to retained", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [{ candidateId: "cf-1" }],
    };
    const decisions = normalizeDecisions(raw, candidateIds);
    expect(decisions.find((d) => d.candidateId === "cf-1")!.verdict).toBe(
      "retained",
    );
  });

  it("fills in retained for unmentioned candidates", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [{ candidateId: "cf-1", verdict: "promoted" }],
    };
    const decisions = normalizeDecisions(raw, candidateIds);
    expect(decisions).toHaveLength(3);
    expect(decisions.find((d) => d.candidateId === "cf-2")!.verdict).toBe(
      "retained",
    );
    expect(decisions.find((d) => d.candidateId === "cf-3")!.verdict).toBe(
      "retained",
    );
  });

  it("ignores candidates not in the candidateIds set", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [{ candidateId: "cf-unknown", verdict: "promoted" }],
    };
    const decisions = normalizeDecisions(raw, candidateIds);
    expect(
      decisions.find((d) => d.candidateId === "cf-unknown"),
    ).toBeUndefined();
    // All three known ids should be retained
    expect(decisions).toHaveLength(3);
  });

  it("deduplicates candidates, keeping first occurrence", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [
        { candidateId: "cf-1", verdict: "promoted", detail: "first" },
        { candidateId: "cf-1", verdict: "rejected", detail: "second" },
      ],
    };
    const decisions = normalizeDecisions(raw, candidateIds);
    const d1 = decisions.filter((d) => d.candidateId === "cf-1");
    expect(d1).toHaveLength(1);
    expect(d1[0]!.verdict).toBe("promoted");
    expect(d1[0]!.detail).toBe("first");
  });

  it("handles empty candidateDecisions array", () => {
    const raw: RawSlowLaneResponse = { candidateDecisions: [] };
    const decisions = normalizeDecisions(raw, candidateIds);
    expect(decisions).toHaveLength(3);
    decisions.forEach((d) => expect(d.verdict).toBe("retained"));
  });

  it("handles missing candidateDecisions field", () => {
    const raw: RawSlowLaneResponse = {};
    const decisions = normalizeDecisions(raw, candidateIds);
    expect(decisions).toHaveLength(3);
    decisions.forEach((d) => expect(d.verdict).toBe("retained"));
  });

  it("handles empty candidateIds set", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [{ candidateId: "cf-1", verdict: "promoted" }],
    };
    const decisions = normalizeDecisions(raw, new Set());
    expect(decisions).toHaveLength(0);
  });

  it("defaults missing detail to empty string", () => {
    const raw: RawSlowLaneResponse = {
      candidateDecisions: [{ candidateId: "cf-1", verdict: "promoted" }],
    };
    const decisions = normalizeDecisions(raw, candidateIds);
    expect(decisions.find((d) => d.candidateId === "cf-1")!.detail).toBe("");
  });
});

// ---------------------------------------------------------------------------
// normalizeSupersessions
// ---------------------------------------------------------------------------

describe("normalizeSupersessions", () => {
  it("keeps complete entries", () => {
    const raw: RawSlowLaneResponse = {
      supersessions: [
        { existingFactSnippet: "old fact", supersededBy: "new fact" },
      ],
    };
    const result = normalizeSupersessions(raw);
    expect(result).toHaveLength(1);
    expect(result[0]!.existingFactSnippet).toBe("old fact");
    expect(result[0]!.supersededBy).toBe("new fact");
  });

  it("excludes entries missing existingFactSnippet", () => {
    const raw: RawSlowLaneResponse = {
      supersessions: [{ supersededBy: "new fact" }],
    };
    const result = normalizeSupersessions(raw);
    expect(result).toHaveLength(0);
  });

  it("excludes entries missing supersededBy", () => {
    const raw: RawSlowLaneResponse = {
      supersessions: [{ existingFactSnippet: "old fact" }],
    };
    const result = normalizeSupersessions(raw);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when supersessions field is missing", () => {
    expect(normalizeSupersessions({})).toEqual([]);
  });

  it("returns empty array for empty supersessions", () => {
    expect(normalizeSupersessions({ supersessions: [] })).toEqual([]);
  });

  it("filters mixed complete and incomplete entries", () => {
    const raw: RawSlowLaneResponse = {
      supersessions: [
        { existingFactSnippet: "a", supersededBy: "b" },
        { existingFactSnippet: "c" },
        { supersededBy: "d" },
        { existingFactSnippet: "e", supersededBy: "f" },
      ],
    };
    const result = normalizeSupersessions(raw);
    expect(result).toHaveLength(2);
    expect(result[0]!.existingFactSnippet).toBe("a");
    expect(result[1]!.existingFactSnippet).toBe("e");
  });
});

// ---------------------------------------------------------------------------
// normalizeThreadReconciliations
// ---------------------------------------------------------------------------

describe("normalizeThreadReconciliations", () => {
  it("keeps valid actions: resolve, archive, retain", () => {
    const raw: RawSlowLaneResponse = {
      threadReconciliations: [
        { threadSnippet: "t1", action: "resolve", rationale: "done" },
        { threadSnippet: "t2", action: "archive", rationale: "old" },
        { threadSnippet: "t3", action: "retain", rationale: "still active" },
      ],
    };
    const result = normalizeThreadReconciliations(raw);
    expect(result).toHaveLength(3);
    expect(result[0]!.action).toBe("resolve");
    expect(result[1]!.action).toBe("archive");
    expect(result[2]!.action).toBe("retain");
  });

  it("defaults invalid action to retain", () => {
    const raw: RawSlowLaneResponse = {
      threadReconciliations: [
        { threadSnippet: "t1", action: "invalid_action" },
      ],
    };
    const result = normalizeThreadReconciliations(raw);
    expect(result[0]!.action).toBe("retain");
  });

  it("defaults missing action to retain", () => {
    const raw: RawSlowLaneResponse = {
      threadReconciliations: [{ threadSnippet: "t1" }],
    };
    const result = normalizeThreadReconciliations(raw);
    expect(result[0]!.action).toBe("retain");
  });

  it("excludes entries missing threadSnippet", () => {
    const raw: RawSlowLaneResponse = {
      threadReconciliations: [{ action: "resolve", rationale: "no snippet" }],
    };
    const result = normalizeThreadReconciliations(raw);
    expect(result).toHaveLength(0);
  });

  it("returns empty when field is missing", () => {
    expect(normalizeThreadReconciliations({})).toEqual([]);
  });

  it("returns empty for empty array", () => {
    expect(
      normalizeThreadReconciliations({ threadReconciliations: [] }),
    ).toEqual([]);
  });

  it("defaults missing rationale to empty string", () => {
    const raw: RawSlowLaneResponse = {
      threadReconciliations: [{ threadSnippet: "t1", action: "retain" }],
    };
    const result = normalizeThreadReconciliations(raw);
    expect(result[0]!.rationale).toBe("");
  });
});

// ---------------------------------------------------------------------------
// applyPromotedFacts
// ---------------------------------------------------------------------------

describe("applyPromotedFacts", () => {
  const minimalState = [
    "## Cast\n\nAlice -- protagonist",
    "## Hard Facts\n\n- Old fact. (added: 2026-01-01)",
  ].join("\n\n");

  it("returns original state when no promoted decisions", () => {
    const result = applyPromotedFacts(minimalState, [
      { candidateId: "cf-1", verdict: "retained", detail: "some fact" },
      { candidateId: "cf-2", verdict: "rejected", detail: "bad fact" },
    ]);
    expect(result).toBe(minimalState);
  });

  it("adds promoted facts to the hard facts section", () => {
    const result = applyPromotedFacts(minimalState, [
      { candidateId: "cf-1", verdict: "promoted", detail: "Alice is brave" },
    ]);
    expect(result).toContain("Alice is brave");
    expect(result).toContain("Old fact");
  });

  it("adds multiple promoted facts", () => {
    const result = applyPromotedFacts(minimalState, [
      { candidateId: "cf-1", verdict: "promoted", detail: "Fact A" },
      { candidateId: "cf-2", verdict: "promoted", detail: "Fact B" },
      { candidateId: "cf-3", verdict: "rejected", detail: "Fact C" },
    ]);
    expect(result).toContain("Fact A");
    expect(result).toContain("Fact B");
    expect(result).not.toContain("Fact C");
  });

  it("skips promoted facts with empty detail", () => {
    const result = applyPromotedFacts(minimalState, [
      { candidateId: "cf-1", verdict: "promoted", detail: "" },
    ]);
    // Should still return something parseable but not add an empty fact
    expect(result).toContain("Old fact");
  });

  it("handles empty decisions array", () => {
    const result = applyPromotedFacts(minimalState, []);
    expect(result).toBe(minimalState);
  });
});
