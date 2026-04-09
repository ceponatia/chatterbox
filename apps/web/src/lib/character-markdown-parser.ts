import type {
  CharacterAppearanceEntry,
  CharacterBehavioralProfile,
  CharacterIdentity,
} from "@/lib/story-project-types";

export interface ParsedCharacterMarkdown {
  name: string | null;
  identity: CharacterIdentity | null;
  background: string | null;
  appearance: CharacterAppearanceEntry[] | null;
  behavioralProfile: CharacterBehavioralProfile | null;
  startingDemeanor: string | null;
  unparsed: string[];
}

interface MarkdownSection {
  heading: string;
  content: string;
}

function stripHtmlComments(value: string): string {
  return value.replace(/<!--([\s\S]*?)-->/g, "");
}

function cleanText(value: string): string {
  return stripHtmlComments(value).trim();
}

function cleanNullableText(value: string): string | null {
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function splitSections(markdown: string): MarkdownSection[] {
  const matches = Array.from(markdown.matchAll(/^##\s+(.+?)\s*$/gim));
  const sections: MarkdownSection[] = [];

  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!;
    const nextMatch = matches[index + 1];
    const contentStart = match.index! + match[0].length;
    const contentEnd = nextMatch?.index ?? markdown.length;
    sections.push({
      heading: match[1]!.trim(),
      content: markdown.slice(contentStart, contentEnd).trim(),
    });
  }

  return sections;
}

function parseLabeledLines(
  content: string,
): Array<{ key: string; value: string }> {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^-\s+(?:\*\*)?(.+?)(?:\*\*)?\s*:\s*(.*?)\s*$/);
      if (!match) return [];
      return [{ key: match[1]!.trim(), value: cleanText(match[2]!) }];
    });
}

function parseIdentity(content: string): CharacterIdentity | null {
  const identity: CharacterIdentity = {
    age: "",
    role: "",
    situation: "",
    pronouns: "",
    species: "",
  };

  for (const entry of parseLabeledLines(content)) {
    const key = normalizeKey(entry.key);
    if (key === "age") identity.age = entry.value;
    if (key === "role") identity.role = entry.value;
    if (key === "situation") identity.situation = entry.value;
    if (key === "pronouns") identity.pronouns = entry.value;
    if (key === "species") identity.species = entry.value;
  }

  return Object.values(identity).every((value) => value.length === 0)
    ? null
    : identity;
}

function parseAppearance(content: string): CharacterAppearanceEntry[] | null {
  const appearance = parseLabeledLines(content)
    .map((entry) => ({
      attribute: entry.key.trim(),
      value: entry.value.trim(),
    }))
    .filter((entry) => entry.attribute.length > 0 && entry.value.length > 0);

  return appearance.length > 0 ? appearance : null;
}

function buildBehavioralProfile(
  values: CharacterBehavioralProfile,
): CharacterBehavioralProfile | null {
  return Object.values(values).every((value) => value.length === 0)
    ? null
    : values;
}

function pushUnparsedSection(
  unparsed: string[],
  heading: string,
  content: string,
) {
  const cleaned = cleanText(content);
  unparsed.push(
    cleaned.length > 0 ? `## ${heading}\n\n${cleaned}` : `## ${heading}`,
  );
}

const BEHAVIORAL_HEADING_MAP: Record<string, keyof CharacterBehavioralProfile> =
  {
    "speech patterns": "speechPatterns",
    "speech pattern": "speechPatterns",
    vocabulary: "vocabulary",
    "emotional texture": "emotionalTexture",
    "with {{ user }}": "withPlayer",
    "common mistakes to avoid": "commonMistakes",
    "common mistakes": "commonMistakes",
    mannerisms: "mannerisms",
  };

function parseBehavioralProfile(
  content: string,
  unparsed: string[],
): CharacterBehavioralProfile | null {
  const cleaned = cleanText(content);
  if (!cleaned) return null;

  const profile: CharacterBehavioralProfile = {
    overview: "",
    speechPatterns: "",
    vocabulary: "",
    emotionalTexture: "",
    withPlayer: "",
    commonMistakes: "",
    mannerisms: "",
  };

  const matches = Array.from(cleaned.matchAll(/^###\s+(.+?)\s*$/gim));
  const overviewEnd = matches[0]?.index ?? cleaned.length;
  profile.overview = cleanText(cleaned.slice(0, overviewEnd));

  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!;
    const nextMatch = matches[index + 1];
    const heading = normalizeKey(match[1]!);
    const start = match.index! + match[0].length;
    const end = nextMatch?.index ?? cleaned.length;
    const value = cleanText(cleaned.slice(start, end));

    const field = BEHAVIORAL_HEADING_MAP[heading];
    if (field) {
      profile[field] = value;
      continue;
    }

    const sectionBody =
      value.length > 0
        ? `### ${match[1]!.trim()}\n\n${value}`
        : `### ${match[1]!.trim()}`;
    unparsed.push(`## Behavioral Profile\n\n${sectionBody}`);
  }

  return buildBehavioralProfile(profile);
}

function parseCharacterName(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  const rawName = match?.[1]?.trim();
  if (!rawName) return null;

  const cleaned = rawName
    .replace(/\s*--\s*character file\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function parseCharacterMarkdown(
  markdown: string,
): ParsedCharacterMarkdown {
  const stripped = stripHtmlComments(markdown);
  const unparsed: string[] = [];
  let identity: CharacterIdentity | null = null;
  let background: string | null = null;
  let appearance: CharacterAppearanceEntry[] | null = null;
  let behavioralProfile: CharacterBehavioralProfile | null = null;
  let startingDemeanor: string | null = null;

  for (const section of splitSections(stripped)) {
    const heading = normalizeKey(section.heading);
    if (heading === "identity") {
      identity = parseIdentity(section.content);
      continue;
    }
    if (heading === "background") {
      background = cleanNullableText(section.content);
      continue;
    }
    if (heading === "appearance") {
      appearance = parseAppearance(section.content);
      continue;
    }
    if (heading === "behavioral profile") {
      behavioralProfile = parseBehavioralProfile(section.content, unparsed);
      continue;
    }
    if (heading === "starting demeanor") {
      startingDemeanor = cleanNullableText(section.content);
      continue;
    }

    pushUnparsedSection(unparsed, section.heading, section.content);
  }

  return {
    name: parseCharacterName(stripped),
    identity,
    background,
    appearance,
    behavioralProfile,
    startingDemeanor,
    unparsed,
  };
}
