import { describe, it, expect } from "vitest";
import { matchesTopicKeywords } from "../topic-detector";

describe("matchesTopicKeywords", () => {
  // -------------------------------------------------------------------------
  // Exact keyword matches
  // -------------------------------------------------------------------------

  describe("exact keyword matches", () => {
    it("matches exact keyword in message", () => {
      expect(matchesTopicKeywords("Do you remember?", ["remember"])).toBe(true);
    });

    it("matches keyword at start of message", () => {
      expect(matchesTopicKeywords("school is fun", ["school"])).toBe(true);
    });

    it("matches keyword at end of message", () => {
      expect(matchesTopicKeywords("I went to school", ["school"])).toBe(true);
    });

    it("case insensitive matching", () => {
      expect(matchesTopicKeywords("REMEMBER that time?", ["remember"])).toBe(
        true,
      );
    });

    it("case insensitive keyword", () => {
      expect(matchesTopicKeywords("do you remember?", ["REMEMBER"])).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Stemmed matches
  // -------------------------------------------------------------------------

  describe("stemmed matches", () => {
    it("matches -ing suffix: remembering -> remember", () => {
      expect(matchesTopicKeywords("I was remembering that", ["remember"])).toBe(
        true,
      );
    });

    it("matches -s suffix: schools -> school", () => {
      expect(matchesTopicKeywords("There are many schools", ["school"])).toBe(
        true,
      );
    });

    it("matches -es suffix: watches -> watch", () => {
      expect(matchesTopicKeywords("She watches movies", ["watch"])).toBe(true);
    });

    it("matches -ed suffix: bullied -> bulli (stem)", () => {
      // "bullied" has 7 chars, minLen for -ed is 5, so stem = "bulli"
      // keyword "bullied" stems to "bulli" as well, so they match
      expect(
        matchesTopicKeywords("He was bullied at school", ["bullied"]),
      ).toBe(true);
    });

    it("matches -tion suffix: education -> educa", () => {
      // "education" has 9 chars, minLen for -tion is 7, stem = "educa"
      // keyword "education" also stems to "educa"
      expect(
        matchesTopicKeywords("Her education was great", ["education"]),
      ).toBe(true);
    });

    it("matches -ly suffix: quickly -> quick", () => {
      // "quickly" has 7 chars, minLen for -ly is 5, stem = "quick"
      expect(matchesTopicKeywords("She ran quickly", ["quick"])).toBe(true);
    });

    it("does not stem short words below minLen", () => {
      // "dogs" has 4 chars, minLen for -s is 4, so stem = "dog"
      expect(matchesTopicKeywords("I love dogs", ["dog"])).toBe(true);
    });

    it("does not stem word ending in -s if too short", () => {
      // "us" has 2 chars, minLen for -s is 4, no stemming
      expect(matchesTopicKeywords("Is it us?", ["u"])).toBe(false);
    });

    it("first matching suffix rule wins", () => {
      // "singing" has 7 chars, -ing rule has minLen=6: stem = "sing"
      expect(matchesTopicKeywords("She was singing", ["sing"])).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Multi-word keyword matching
  // -------------------------------------------------------------------------

  describe("multi-word keywords", () => {
    it("matches multi-word keyword as substring", () => {
      expect(
        matchesTopicKeywords("I went to middle school yesterday", [
          "middle school",
        ]),
      ).toBe(true);
    });

    it("does not match when words are not adjacent", () => {
      expect(
        matchesTopicKeywords("the school in the middle of town", [
          "middle school",
        ]),
      ).toBe(false);
    });

    it("multi-word match is case insensitive", () => {
      expect(
        matchesTopicKeywords("I went to MIDDLE SCHOOL yesterday", [
          "middle school",
        ]),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // No match / edge cases
  // -------------------------------------------------------------------------

  describe("no match and edge cases", () => {
    it("returns false when no keywords match", () => {
      expect(matchesTopicKeywords("hello world", ["remember"])).toBe(false);
    });

    it("returns false for empty message", () => {
      expect(matchesTopicKeywords("", ["remember"])).toBe(false);
    });

    it("returns false for empty keywords array", () => {
      expect(matchesTopicKeywords("some text", [])).toBe(false);
    });

    it("returns false for both empty", () => {
      expect(matchesTopicKeywords("", [])).toBe(false);
    });

    it("matches any one of multiple keywords", () => {
      expect(
        matchesTopicKeywords("tell me about history", [
          "school",
          "history",
          "childhood",
        ]),
      ).toBe(true);
    });

    it("punctuation around keywords does not prevent matching", () => {
      expect(matchesTopicKeywords("Do you remember?", ["remember"])).toBe(true);
    });

    it("handles message with only punctuation", () => {
      expect(matchesTopicKeywords("!?.,", ["remember"])).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Suffix stripping order and edge cases
  // -------------------------------------------------------------------------

  describe("suffix stripping specifics", () => {
    it("-ing is stripped before -tion: 'reconnecting' stems to 'reconnect'", () => {
      // "reconnecting" has 12 chars, -ing minLen=6, so -ing fires first -> "reconnect"
      expect(
        matchesTopicKeywords("She was reconnecting with old friends", [
          "reconnect",
        ]),
      ).toBe(true);
    });

    it("-tion is stripped: 'education' stems to 'educa'", () => {
      // "education" has 9 chars, -tion minLen=7, stem = "educa"
      // keyword "education" also stems to "educa"
      expect(
        matchesTopicKeywords("Her education was important", ["education"]),
      ).toBe(true);
    });

    it("-ed is stripped: 'remembered' stems to 'remember'", () => {
      // "remembered" has 10 chars, -ing doesn't match ending, -tion doesn't match
      // -ed minLen=5, matches -> "remember"
      expect(matchesTopicKeywords("I remembered something", ["remember"])).toBe(
        true,
      );
    });

    it("-ly is stripped: 'quickly' stems to 'quick'", () => {
      expect(matchesTopicKeywords("He ran quickly", ["quick"])).toBe(true);
    });

    it("-es is stripped: 'watches' stems to 'watch'", () => {
      // "watches" has 7 chars, -ing no, -tion no, -ed no, -ly no, -es minLen=5 matches -> "watch"
      expect(matchesTopicKeywords("She watches TV", ["watch"])).toBe(true);
    });

    it("-s is stripped: 'schools' stems to 'school'", () => {
      // "schools" has 7 chars, -ing no, -tion no, -ed no, -ly no, -es minLen=5 matches
      // Wait: "schools" ends in "es" but also ends in "s". -es fires first since minLen=5 and 7>=5.
      // Actually -es checks if word ends with "es". "schools" ends with "ls" not "es". So -es doesn't match.
      // -s fires: "schools" ends in "s", 7>=4, stem = "school"
      expect(matchesTopicKeywords("many schools around", ["school"])).toBe(
        true,
      );
    });

    it("suffix stripping respects minLen: short word not stemmed", () => {
      // "us" has 2 chars, -s minLen=4, not stemmed
      expect(matchesTopicKeywords("It is us", ["u"])).toBe(false);
    });

    it("word that does not match any suffix rule returns unchanged", () => {
      // "cat" has 3 chars, no suffix rule matches (too short for all)
      expect(matchesTopicKeywords("The cat sat", ["cat"])).toBe(true);
    });

    it("-ing suffix checked before -s: 'singing' -> 'sing' not 'singin'", () => {
      // "singing" has 7 chars, -ing minLen=6 -> stem "sing"
      expect(matchesTopicKeywords("She was singing", ["sing"])).toBe(true);
    });

    it("word ending in -ings: -s strips to stem, keyword -ing strips differently", () => {
      // "meetings" (8 chars): endsWith("ing")=false, -s fires -> stem "meeting"
      // keyword "meeting" (7 chars): endsWith("ing")=true, -ing fires -> stem "meet"
      // "meeting" != "meet" so no stem match. But exact word "meeting" != "meetings" either.
      // So this should NOT match.
      expect(matchesTopicKeywords("Weekly meetings happen", ["meeting"])).toBe(
        false,
      );
    });

    it("word ending in -ings matches keyword that is the -s-stem", () => {
      // "meetings" -s stem -> "meeting", keyword "meetings" -s stem -> "meeting" -> match
      expect(matchesTopicKeywords("Weekly meetings happen", ["meetings"])).toBe(
        true,
      );
    });
  });
});
