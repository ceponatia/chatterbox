import { describe, it, expect } from "vitest";
import { parseLocationsRaw } from "../parser-locations";

describe("parseLocationsRaw", () => {
  it("returns empty array for empty input", () => {
    expect(parseLocationsRaw("")).toEqual([]);
  });

  it("returns empty array for content with no ### headings", () => {
    expect(parseLocationsRaw("Some random text\nwithout headings")).toEqual([]);
  });

  it("parses a single location with all fields", () => {
    const md = [
      "### Cafe",
      "- **Description**: A cozy place",
      "- **Tags**: cozy, warm",
      "- **Atmosphere**: Relaxed",
      "- **Connected to**: Park",
    ].join("\n");

    const locs = parseLocationsRaw(md);
    expect(locs).toHaveLength(1);
    expect(locs[0]!.name).toBe("Cafe");
    expect(locs[0]!.description).toBe("A cozy place");
    expect(locs[0]!.tags).toEqual(["cozy", "warm"]);
    expect(locs[0]!.atmosphere).toBe("Relaxed");
    expect(locs[0]!.connections).toHaveLength(1);
    expect(locs[0]!.connections[0]!.targetName).toBe("Park");
  });

  it("parses multiple locations", () => {
    const md = [
      "### Cafe",
      "- **Description**: A cozy place",
      "",
      "### Park",
      "- **Description**: A green space",
    ].join("\n");

    const locs = parseLocationsRaw(md);
    expect(locs).toHaveLength(2);
    expect(locs[0]!.name).toBe("Cafe");
    expect(locs[1]!.name).toBe("Park");
  });

  it("handles location with only a name (no body)", () => {
    const locs = parseLocationsRaw("### Cafe");
    expect(locs).toHaveLength(1);
    expect(locs[0]!.name).toBe("Cafe");
    expect(locs[0]!.description).toBe("");
    expect(locs[0]!.tags).toEqual([]);
    expect(locs[0]!.atmosphere).toBe("");
    expect(locs[0]!.connections).toEqual([]);
  });

  it("handles location with no key-value lines", () => {
    const md = "### Cafe\nJust some plain text here";
    const locs = parseLocationsRaw(md);
    expect(locs).toHaveLength(1);
    expect(locs[0]!.description).toBe("");
  });

  it("ignores lines that don't match key-value pattern", () => {
    const md = [
      "### Cafe",
      "Random line",
      "- **Description**: Valid",
      "- not a valid kv",
      "Another random line",
    ].join("\n");

    const locs = parseLocationsRaw(md);
    expect(locs).toHaveLength(1);
    expect(locs[0]!.description).toBe("Valid");
  });
});

describe("parseLocationsRaw - key classification", () => {
  it("classifies Description key", () => {
    const locs = parseLocationsRaw("### Cafe\n- **Description**: A cozy place");
    expect(locs[0]!.description).toBe("A cozy place");
  });

  it("classifies Tags key", () => {
    const locs = parseLocationsRaw("### Cafe\n- **Tags**: cozy, warm, bright");
    expect(locs[0]!.tags).toEqual(["cozy", "warm", "bright"]);
  });

  it("classifies Atmosphere key", () => {
    const locs = parseLocationsRaw(
      "### Cafe\n- **Atmosphere**: Relaxed and quiet",
    );
    expect(locs[0]!.atmosphere).toBe("Relaxed and quiet");
  });

  it("classifies Mood key as atmosphere", () => {
    const locs = parseLocationsRaw("### Cafe\n- **Mood**: Tense");
    expect(locs[0]!.atmosphere).toBe("Tense");
  });

  it("classifies Connected to key", () => {
    const locs = parseLocationsRaw(
      "### Cafe\n- **Connected to**: Park, Library",
    );
    expect(locs[0]!.connections).toHaveLength(2);
  });

  it("returns null classification for unknown keys (field not set)", () => {
    const locs = parseLocationsRaw("### Cafe\n- **Owner**: Alice");
    expect(locs[0]!.description).toBe("");
    expect(locs[0]!.tags).toEqual([]);
  });

  it("is case-insensitive for key classification", () => {
    const locs = parseLocationsRaw("### Cafe\n- **DESCRIPTION**: Loud");
    expect(locs[0]!.description).toBe("Loud");
  });
});

describe("parseLocationsRaw - connection parsing", () => {
  it("parses simple comma-separated connections", () => {
    const locs = parseLocationsRaw(
      "### Town\n- **Connected to**: Park, Market, Library",
    );
    expect(locs[0]!.connections).toHaveLength(3);
    expect(locs[0]!.connections[0]!.targetName).toBe("Park");
    expect(locs[0]!.connections[0]!.description).toBeUndefined();
  });

  it("parses connections with descriptions in parentheses", () => {
    const locs = parseLocationsRaw(
      "### Town\n- **Connected to**: Park (a short walk), Market (across the bridge)",
    );
    expect(locs[0]!.connections).toHaveLength(2);
    expect(locs[0]!.connections[0]!.targetName).toBe("Park");
    expect(locs[0]!.connections[0]!.description).toBe("a short walk");
    expect(locs[0]!.connections[1]!.targetName).toBe("Market");
    expect(locs[0]!.connections[1]!.description).toBe("across the bridge");
  });

  it("parses connections with traversal hints after semicolons", () => {
    const locs = parseLocationsRaw(
      "### Town\n- **Connected to**: Park (a short walk; 5 minutes)",
    );
    const conn = locs[0]!.connections[0]!;
    expect(conn.targetName).toBe("Park");
    expect(conn.description).toBe("a short walk");
    expect(conn.traversalHint).toBe("5 minutes");
  });

  it("handles commas inside parentheses (depth tracking)", () => {
    const locs = parseLocationsRaw(
      "### Town\n- **Connected to**: Park (scenic, quiet), Market",
    );
    expect(locs[0]!.connections).toHaveLength(2);
    expect(locs[0]!.connections[0]!.targetName).toBe("Park");
    expect(locs[0]!.connections[0]!.description).toBe("scenic, quiet");
  });

  it("handles empty connection string", () => {
    const locs = parseLocationsRaw("### Town\n- **Connected to**: ");
    expect(locs[0]!.connections).toHaveLength(0);
  });

  it("handles single connection with no description", () => {
    const locs = parseLocationsRaw("### Town\n- **Connected to**: Park");
    expect(locs[0]!.connections).toHaveLength(1);
    expect(locs[0]!.connections[0]!.targetName).toBe("Park");
    expect(locs[0]!.connections[0]!.description).toBeUndefined();
  });
});

describe("parseLocationsRaw - full integration", () => {
  it("parses a realistic multi-location block", () => {
    const md = [
      "### The Cafe",
      "- **Description**: A cozy corner cafe with mismatched furniture",
      "- **Tags**: indoor, social, quiet",
      "- **Atmosphere**: Warm and inviting, smells of fresh coffee",
      "- **Connected to**: Main Street (through the front door; 1 minute), Back Alley (through the kitchen)",
      "",
      "### Main Street",
      "- **Description**: A busy street lined with shops",
      "- **Tags**: outdoor, public, busy",
      "- **Atmosphere**: Loud with traffic and chatter",
      "- **Connected to**: The Cafe (glass door on the left), Town Square (north end)",
    ].join("\n");

    const locs = parseLocationsRaw(md);
    expect(locs).toHaveLength(2);

    const cafe = locs[0]!;
    expect(cafe.name).toBe("The Cafe");
    expect(cafe.description).toBe(
      "A cozy corner cafe with mismatched furniture",
    );
    expect(cafe.tags).toEqual(["indoor", "social", "quiet"]);
    expect(cafe.atmosphere).toBe("Warm and inviting, smells of fresh coffee");
    expect(cafe.connections).toHaveLength(2);
    expect(cafe.connections[0]!.targetName).toBe("Main Street");
    expect(cafe.connections[0]!.description).toBe("through the front door");
    expect(cafe.connections[0]!.traversalHint).toBe("1 minute");
    expect(cafe.connections[1]!.targetName).toBe("Back Alley");
    expect(cafe.connections[1]!.description).toBe("through the kitchen");

    const street = locs[1]!;
    expect(street.name).toBe("Main Street");
    expect(street.tags).toEqual(["outdoor", "public", "busy"]);
    expect(street.connections).toHaveLength(2);
  });
});
