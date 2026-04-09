import type { StructuredStoryState } from "./types";

const SECTION_MAP: Record<string, keyof Omit<StructuredStoryState, "custom">> =
  {
    cast: "entities",
    relationships: "relationships",
    appearance: "appearance",
    characters: "appearance",
    scene: "scene",
    "current demeanor": "demeanor",
    demeanor: "demeanor",
    "open threads": "openThreads",
    threads: "openThreads",
    "hard facts": "hardFacts",
    facts: "hardFacts",
    style: "style",
  };

export function resolveSection(
  heading: string,
): keyof Omit<StructuredStoryState, "custom"> | null {
  const normalized = heading
    .toLowerCase()
    .replace(/\s*\(.*\)$/, "")
    .trim();
  return SECTION_MAP[normalized] ?? null;
}

interface RawCastEntry {
  name: string;
  description: string;
  isPlayer: boolean;
}

interface RawRelEntry {
  from: string;
  to: string;
  description: string;
  details: string[];
}

interface RawAppEntry {
  character: string;
  attribute: string;
  description: string;
}

interface RawDemEntry {
  character: string;
  mood: string;
  energy: string;
}

function parseCastRaw(content: string): RawCastEntry[] {
  const members: RawCastEntry[] = [];
  const lines = content.split("\n");
  let current: { name: string; descParts: string[]; isPlayer: boolean } | null =
    null;

  for (const line of lines) {
    const trimmed = line.trim();
    const entryMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*\s*[-—:–]\s*(.*)$/);
    if (entryMatch) {
      if (current) {
        members.push({
          name: current.name,
          description: current.descParts.join("\n").trim(),
          isPlayer: current.isPlayer,
        });
      }
      const name = entryMatch[1]!.trim();
      const description = entryMatch[2]!.trim();
      const isPlayer = /\[player character/i.test(description);
      current = { name, descParts: [description], isPlayer };
      continue;
    }

    if (current && trimmed) {
      current.descParts.push(trimmed);
    }
  }

  if (current) {
    members.push({
      name: current.name,
      description: current.descParts.join("\n").trim(),
      isPlayer: current.isPlayer,
    });
  }

  return members;
}

function parseRelationshipsRaw(content: string): RawRelEntry[] {
  const relationships: RawRelEntry[] = [];
  const lines = content.split("\n");
  let current: {
    from: string;
    to: string;
    description: string;
    details: string[];
  } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const entryMatch = trimmed.match(
      /^-\s+\*\*(.+?)\s*[→>]\s*(.+?)\*\*\s*:\s*(.*)$/,
    );
    if (entryMatch) {
      if (current) {
        relationships.push(current);
      }
      current = {
        from: entryMatch[1]!.trim(),
        to: entryMatch[2]!.trim(),
        description: entryMatch[3]!.trim(),
        details: [],
      };
      continue;
    }

    if (current && /^\s+-\s+/.test(line)) {
      current.details.push(trimmed.replace(/^-\s+/, ""));
      continue;
    }

    if (current && trimmed) {
      current.description += ` ${trimmed}`;
    }
  }

  if (current) {
    relationships.push(current);
  }

  return relationships;
}

function parseAppearanceRaw(content: string): RawAppEntry[] {
  const entries: RawAppEntry[] = [];
  const lines = content.split("\n");
  let current: {
    character: string;
    attribute: string;
    descParts: string[];
  } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const entryMatch = trimmed.match(
      /^-\s+\*\*(.+?)\s*[-—–]\s*(.+?)\*\*\s*:\s*(.*)$/,
    );
    if (entryMatch) {
      if (current) {
        entries.push({
          character: current.character,
          attribute: current.attribute,
          description: current.descParts.join(" ").trim(),
        });
      }
      current = {
        character: entryMatch[1]!.trim(),
        attribute: entryMatch[2]!.trim(),
        descParts: [entryMatch[3]!.trim()],
      };
      continue;
    }

    if (current && trimmed) {
      current.descParts.push(trimmed);
    }
  }

  if (current) {
    entries.push({
      character: current.character,
      attribute: current.attribute,
      description: current.descParts.join(" ").trim(),
    });
  }

  return entries;
}

function classifyCharacterLine(
  trimmed: string,
):
  | { kind: "h3"; name: string }
  | { kind: "h4"; name: string }
  | { kind: "kv"; attribute: string; value: string }
  | { kind: "flat"; character: string; attribute: string; value: string }
  | { kind: "text" } {
  const h3 = trimmed.match(/^###\s+(.+)$/);
  if (h3) return { kind: "h3", name: h3[1]!.trim() };

  const h4 = trimmed.match(/^####\s+(.+)$/);
  if (h4) return { kind: "h4", name: h4[1]!.trim() };

  const kv = trimmed.match(/^-\s+\*\*(.+?)\*\*\s*:\s*(.*)$/);
  if (kv) return { kind: "kv", attribute: kv[1]!.trim(), value: kv[2]!.trim() };

  const flat = trimmed.match(/^-\s+\*\*(.+?)\s*[-—–]\s*(.+?)\*\*\s*:\s*(.*)$/);
  if (flat) {
    return {
      kind: "flat",
      character: flat[1]!.trim(),
      attribute: flat[2]!.trim(),
      value: flat[3]!.trim(),
    };
  }

  return { kind: "text" };
}

interface CharParseState {
  entries: RawAppEntry[];
  currentChar: string;
  current: { attribute: string; descParts: string[] } | null;
}

function flushCharEntry(state: CharParseState): void {
  if (state.current && state.currentChar) {
    state.entries.push({
      character: state.currentChar,
      attribute: state.current.attribute,
      description: state.current.descParts.join(" ").trim(),
    });
    state.current = null;
  }
}

function processCharacterLine(
  state: CharParseState,
  line: ReturnType<typeof classifyCharacterLine>,
  rawLine: string,
): void {
  switch (line.kind) {
    case "h3":
      flushCharEntry(state);
      state.currentChar = line.name;
      break;
    case "h4":
      flushCharEntry(state);
      break;
    case "kv":
      if (!state.currentChar) break;
      flushCharEntry(state);
      state.current = { attribute: line.attribute, descParts: [line.value] };
      break;
    case "flat":
      flushCharEntry(state);
      state.entries.push({
        character: line.character,
        attribute: line.attribute,
        description: line.value,
      });
      break;
    case "text":
      if (state.current && rawLine.trim()) {
        state.current.descParts.push(rawLine.trim());
      }
      break;
  }
}

function parseCharactersRaw(content: string): RawAppEntry[] {
  const state: CharParseState = { entries: [], currentChar: "", current: null };

  for (const line of content.split("\n")) {
    processCharacterLine(state, classifyCharacterLine(line.trim()), line);
  }
  flushCharEntry(state);

  if (state.entries.length === 0 && content.trim()) {
    return parseAppearanceRaw(content);
  }
  return state.entries;
}

function classifySceneKey(
  key: string,
): "location" | "present" | "atmosphere" | null {
  const lower = key.toLowerCase();
  if (
    lower.includes("where") ||
    lower.includes("when") ||
    lower.includes("location")
  ) {
    return "location";
  }
  if (lower.includes("present") || lower.includes("who")) return "present";
  if (
    lower.includes("atmosphere") ||
    lower.includes("mood") ||
    lower.includes("vibe")
  ) {
    return "atmosphere";
  }
  return null;
}

function parseSceneRaw(content: string): {
  location: string;
  presentNames: string[];
  atmosphere: string;
} {
  const scene = { location: "", presentNames: [] as string[], atmosphere: "" };

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const kvMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const value = kvMatch[2]!.trim();
    const kind = classifySceneKey(kvMatch[1]!);
    if (kind === "location") {
      scene.location = value;
    } else if (kind === "present") {
      scene.presentNames = value
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    } else if (kind === "atmosphere") {
      scene.atmosphere = value;
    }
  }

  return scene;
}

function parseDemeanorRaw(content: string): RawDemEntry[] {
  const entries: RawDemEntry[] = [];
  let globalEnergy = "";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const kvMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1]!;
    const value = kvMatch[2]!.trim();
    if (/energy/i.test(key)) {
      globalEnergy = value;
      continue;
    }

    if (/mood/i.test(key)) {
      const charMatch = key.match(/^(.+?)(?:'s|'s)\s+mood/i);
      const character = charMatch
        ? charMatch[1]!.trim()
        : key.replace(/\s*mood\s*/i, "").trim();
      entries.push({ character, mood: value, energy: "" });
    }
  }

  if (entries.length === 0 && globalEnergy) {
    entries.push({ character: "", mood: "", energy: globalEnergy });
  } else {
    for (const entry of entries) {
      if (!entry.energy) entry.energy = globalEnergy;
    }
  }

  return entries;
}

function parseBulletList(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s+/, ""));
}

function parseTimestampedItem(text: string): {
  text: string;
  createdAt?: string;
  resolutionHint?: string;
} {
  let remaining = text;
  let createdAt: string | undefined;
  let resolutionHint: string | undefined;

  const dateMatch = remaining.match(/\(added:\s*(\d{4}-\d{2}-\d{2})\)\s*$/);
  if (dateMatch) {
    createdAt = dateMatch[1]!;
    remaining = remaining.slice(0, dateMatch.index).trim();
  }

  const hintMatch = remaining.match(/\(resolves when:\s*(.+?)\)\s*$/);
  if (hintMatch) {
    resolutionHint = hintMatch[1]!.trim();
    remaining = remaining.slice(0, hintMatch.index).trim();
  }

  return { text: remaining, createdAt, resolutionHint };
}

function parseTimestampedBulletList(
  content: string,
): { text: string; createdAt?: string; resolutionHint?: string }[] {
  return parseBulletList(content).map(parseTimestampedItem);
}

export interface RawSections {
  cast: RawCastEntry[];
  relationships: RawRelEntry[];
  appearance: RawAppEntry[];
  scene: { location: string; presentNames: string[]; atmosphere: string };
  demeanor: RawDemEntry[];
  openThreads: { text: string; createdAt?: string; resolutionHint?: string }[];
  hardFacts: { text: string; createdAt?: string }[];
  style: string[];
}

export function emptyRawSections(): RawSections {
  return {
    cast: [],
    relationships: [],
    appearance: [],
    scene: { location: "", presentNames: [], atmosphere: "" },
    demeanor: [],
    openThreads: [],
    hardFacts: [],
    style: [],
  };
}

export function parseRawSection(
  raw: RawSections,
  section: keyof Omit<StructuredStoryState, "custom">,
  content: string,
): void {
  switch (section) {
    case "entities":
      raw.cast = parseCastRaw(content);
      break;
    case "relationships":
      raw.relationships = parseRelationshipsRaw(content);
      break;
    case "appearance":
      raw.appearance = /^###\s/m.test(content)
        ? parseCharactersRaw(content)
        : parseAppearanceRaw(content);
      break;
    case "scene":
      raw.scene = parseSceneRaw(content);
      break;
    case "demeanor":
      raw.demeanor = parseDemeanorRaw(content);
      break;
    case "openThreads":
      raw.openThreads = parseTimestampedBulletList(content);
      break;
    case "hardFacts":
      raw.hardFacts = parseTimestampedBulletList(content);
      break;
    case "style":
      raw.style = parseBulletList(content);
      break;
  }
}
