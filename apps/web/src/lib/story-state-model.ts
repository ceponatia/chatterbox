// ---------------------------------------------------------------------------
// Structured Story State — entity-centric types, parser, and serializer
// ---------------------------------------------------------------------------
//
// Internal JSON representation of story state. Characters are first-class
// Entity objects with stable UUIDs. All character-referencing sections store
// entityId references instead of duplicated name strings. Parsed from markdown
// on import, serialized back to markdown for LLM injection.
// See IM03 (atomization rationale) and IM04 (entity-centric model).
// ---------------------------------------------------------------------------

// --- Entity (replaces CastMember) ---

export interface Entity {
  id: string;
  name: string;
  description: string;
  isPlayerCharacter: boolean;
}

// --- Section types (reference entities by ID) ---

export interface Relationship {
  fromEntityId: string;
  toEntityId: string;
  description: string;
  /** Multi-line detail bullets (optional) */
  details: string[];
}

export interface AppearanceEntry {
  entityId: string;
  attribute: string;
  description: string;
}

export interface SceneInfo {
  location: string;
  presentEntityIds: string[];
  atmosphere: string;
}

export interface DemeanorEntry {
  entityId: string;
  mood: string;
  energy: string;
}

// --- Unchanged section types ---

export interface StoryThread {
  description: string;
  /** ISO date string when this thread was added */
  createdAt?: string;
}

export interface HardFact {
  fact: string;
  /** ISO date string when this fact was added */
  createdAt?: string;
}

export interface CustomSection {
  heading: string;
  content: string;
}

// --- Top-level model ---

export interface StructuredStoryState {
  entities: Entity[];
  relationships: Relationship[];
  appearance: AppearanceEntry[];
  scene: SceneInfo;
  demeanor: DemeanorEntry[];
  openThreads: StoryThread[];
  hardFacts: HardFact[];
  style: string[];
  /** Catch-all for sections we don't have typed models for */
  custom: CustomSection[];
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
function generateEntityId(): string {
  return `e-${Date.now()}-${++_idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Resolve an entity name from an ID. Returns the ID itself as fallback. */
export function resolveEntityName(entities: Entity[], id: string): string {
  return entities.find((e) => e.id === id)?.name ?? id;
}

/**
 * Find an entity by name. Tries exact match first, then partial match
 * (query is a word-boundary substring of an entity name, or vice versa).
 * Partial match only returns a result if exactly one entity matches
 * (avoids ambiguity when multiple entities share a first name).
 */
export function findEntityByName(
  entities: Entity[],
  name: string,
): Entity | undefined {
  const lower = name.toLowerCase().trim();
  // 1. Exact match
  const exact = entities.find((e) => e.name.toLowerCase().trim() === lower);
  if (exact) return exact;
  // 2. Partial: query is a token-subset of entity name or vice versa
  const queryTokens = lower.split(/\s+/);
  const partials = entities.filter((e) => {
    const entTokens = e.name.toLowerCase().trim().split(/\s+/);
    return (
      queryTokens.every((qt) => entTokens.some((et) => et === qt)) ||
      entTokens.every((et) => queryTokens.some((qt) => qt === et))
    );
  });
  return partials.length === 1 ? partials[0] : undefined;
}

/**
 * Find an entity by name or create a new one if it doesn't exist.
 * Mutates the entities array if a new entity is created.
 */
export function findOrCreateEntity(
  entities: Entity[],
  name: string,
  isPlayerCharacter = false,
): Entity {
  const existing = findEntityByName(entities, name);
  if (existing) return existing;
  const entity: Entity = {
    id: generateEntityId(),
    name: name.trim(),
    description: "",
    isPlayerCharacter,
  };
  entities.push(entity);
  return entity;
}

/**
 * Reconcile new entities (from a fresh parse) against existing entities
 * (from current state). Preserves existing UUIDs for name-matched entities.
 * New names get new UUIDs. Returns the reconciled entity list and an ID
 * remap (incoming ID → reconciled ID) for rewriting section references.
 */
export function reconcileEntities(
  existing: Entity[],
  incoming: Entity[],
): { entities: Entity[]; idRemap: Record<string, string> } {
  const result: Entity[] = [];
  const matched = new Set<string>();
  const idRemap: Record<string, string> = {};

  for (const inc of incoming) {
    const match = findEntityByName(existing, inc.name);
    if (match) {
      result.push({
        ...match,
        description: inc.description,
        isPlayerCharacter: inc.isPlayerCharacter,
      });
      matched.add(match.id);
      if (inc.id !== match.id) idRemap[inc.id] = match.id;
    } else {
      result.push(inc);
    }
  }

  // Preserve existing entities not mentioned in incoming (pipeline may have omitted them)
  for (const ex of existing) {
    if (!matched.has(ex.id)) {
      result.push(ex);
    }
  }

  return { entities: result, idRemap };
}

/** Rewrite all entity ID references in a state using the given remap. */
export function remapEntityIds(
  state: StructuredStoryState,
  idRemap: Record<string, string>,
): StructuredStoryState {
  if (Object.keys(idRemap).length === 0) return state;
  const r = (id: string) => idRemap[id] ?? id;
  return {
    ...state,
    relationships: state.relationships.map((rel) => ({
      ...rel,
      fromEntityId: r(rel.fromEntityId),
      toEntityId: r(rel.toEntityId),
    })),
    appearance: state.appearance.map((a) => ({
      ...a,
      entityId: r(a.entityId),
    })),
    scene: {
      ...state.scene,
      presentEntityIds: state.scene.presentEntityIds.map(r),
    },
    demeanor: state.demeanor.map((d) => ({ ...d, entityId: r(d.entityId) })),
  };
}

// ---------------------------------------------------------------------------
// Empty state factory
// ---------------------------------------------------------------------------

export function emptyStructuredState(): StructuredStoryState {
  return {
    entities: [],
    relationships: [],
    appearance: [],
    scene: { location: "", presentEntityIds: [], atmosphere: "" },
    demeanor: [],
    openThreads: [],
    hardFacts: [],
    style: [],
    custom: [],
  };
}

// ---------------------------------------------------------------------------
// Markdown → Structured parser (two-pass: entity extraction → ID resolution)
// ---------------------------------------------------------------------------

/** Heading name → known section key mapping (case-insensitive) */
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

function resolveSection(
  heading: string,
): keyof Omit<StructuredStoryState, "custom"> | null {
  const normalized = heading
    .toLowerCase()
    .replace(/\s*\(.*\)$/, "")
    .trim();
  return SECTION_MAP[normalized] ?? null;
}

// --- Intermediate raw-parse types (names, not IDs yet) ---

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

// --- Per-section sub-parsers (return raw name-based data) ---

function parseCastRaw(content: string): RawCastEntry[] {
  const members: RawCastEntry[] = [];
  const lines = content.split("\n");
  let current: { name: string; descParts: string[]; isPlayer: boolean } | null =
    null;

  for (const line of lines) {
    const trimmed = line.trim();
    const entryMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*\s*[—:\-–]\s*(.*)$/);
    if (entryMatch) {
      if (current) {
        members.push({
          name: current.name,
          description: current.descParts.join("\n").trim(),
          isPlayer: current.isPlayer,
        });
      }
      const name = entryMatch[1]!.trim();
      const desc = entryMatch[2]!.trim();
      const isPlayer = /\[player character/i.test(desc);
      current = { name, descParts: [desc], isPlayer };
    } else if (current && trimmed) {
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
  const rels: RawRelEntry[] = [];
  const lines = content.split("\n");
  let current: {
    from: string;
    to: string;
    desc: string;
    details: string[];
  } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const entryMatch = trimmed.match(
      /^-\s+\*\*(.+?)\s*[→>]\s*(.+?)\*\*\s*:\s*(.*)$/,
    );
    if (entryMatch) {
      if (current) {
        rels.push({
          from: current.from,
          to: current.to,
          description: current.desc,
          details: current.details,
        });
      }
      current = {
        from: entryMatch[1]!.trim(),
        to: entryMatch[2]!.trim(),
        desc: entryMatch[3]!.trim(),
        details: [],
      };
    } else if (current && /^\s+-\s+/.test(line)) {
      current.details.push(trimmed.replace(/^-\s+/, ""));
    } else if (current && trimmed) {
      current.desc += " " + trimmed;
    }
  }
  if (current) {
    rels.push({
      from: current.from,
      to: current.to,
      description: current.desc,
      details: current.details,
    });
  }
  return rels;
}

/** Parse flat appearance format: - **Name — attr**: val */
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
      /^-\s+\*\*(.+?)\s*[—\-–]\s*(.+?)\*\*\s*:\s*(.*)$/,
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
    } else if (current && trimmed) {
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

/**
 * Classify a single line inside a ## Characters block.
 * Returns a discriminated union so the caller stays under complexity limits.
 */
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

  const flat = trimmed.match(/^-\s+\*\*(.+?)\s*[—\-–]\s*(.+?)\*\*\s*:\s*(.*)$/);
  if (flat)
    return {
      kind: "flat",
      character: flat[1]!.trim(),
      attribute: flat[2]!.trim(),
      value: flat[3]!.trim(),
    };

  return { kind: "text" };
}

/**
 * Parse character-centric format:
 * ### CharName
 * #### Appearance
 * - **attr**: val
 * #### Personality
 * - **attr**: val
 */
interface CharParseState {
  entries: RawAppEntry[];
  currentChar: string;
  current: { attribute: string; descParts: string[] } | null;
}

function flushCharEntry(s: CharParseState): void {
  if (s.current && s.currentChar) {
    s.entries.push({
      character: s.currentChar,
      attribute: s.current.attribute,
      description: s.current.descParts.join(" ").trim(),
    });
    s.current = null;
  }
}

function processCharacterLine(
  s: CharParseState,
  cl: ReturnType<typeof classifyCharacterLine>,
  rawLine: string,
): void {
  switch (cl.kind) {
    case "h3":
      flushCharEntry(s);
      s.currentChar = cl.name;
      break;
    case "h4":
      flushCharEntry(s);
      break;
    case "kv":
      if (!s.currentChar) break;
      flushCharEntry(s);
      s.current = { attribute: cl.attribute, descParts: [cl.value] };
      break;
    case "flat":
      flushCharEntry(s);
      s.entries.push({
        character: cl.character,
        attribute: cl.attribute,
        description: cl.value,
      });
      break;
    case "text":
      if (s.current && rawLine.trim()) s.current.descParts.push(rawLine.trim());
      break;
  }
}

function parseCharactersRaw(content: string): RawAppEntry[] {
  const s: CharParseState = { entries: [], currentChar: "", current: null };

  for (const line of content.split("\n")) {
    processCharacterLine(s, classifyCharacterLine(line.trim()), line);
  }
  flushCharEntry(s);

  // If no ### headings were found, fall back to flat appearance parsing
  if (s.entries.length === 0 && content.trim()) {
    return parseAppearanceRaw(content);
  }
  return s.entries;
}

function classifySceneKey(
  key: string,
): "location" | "present" | "atmosphere" | null {
  const k = key.toLowerCase();
  if (k.includes("where") || k.includes("when") || k.includes("location"))
    return "location";
  if (k.includes("present") || k.includes("who")) return "present";
  if (k.includes("atmosphere") || k.includes("mood") || k.includes("vibe"))
    return "atmosphere";
  return null;
}

function parseSceneRaw(content: string): {
  location: string;
  presentNames: string[];
  atmosphere: string;
} {
  const scene = { location: "", presentNames: [] as string[], atmosphere: "" };
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    const kvMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*\s*:\s*(.*)$/);
    if (!kvMatch) continue;
    const val = kvMatch[2]!.trim();
    const kind = classifySceneKey(kvMatch[1]!);

    if (kind === "location") scene.location = val;
    else if (kind === "present")
      scene.presentNames = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (kind === "atmosphere") scene.atmosphere = val;
  }
  return scene;
}

function parseDemeanorRaw(content: string): RawDemEntry[] {
  const entries: RawDemEntry[] = [];
  const lines = content.split("\n");
  let globalEnergy = "";

  for (const line of lines) {
    const trimmed = line.trim();
    const kvMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*\s*:\s*(.*)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1]!;
    const val = kvMatch[2]!.trim();

    if (/energy/i.test(key)) {
      globalEnergy = val;
    } else if (/mood/i.test(key)) {
      const charMatch = key.match(/^(.+?)(?:'s|'s)\s+mood/i);
      const character = charMatch
        ? charMatch[1]!.trim()
        : key.replace(/\s*mood\s*/i, "").trim();
      entries.push({ character, mood: val, energy: "" });
    }
  }

  if (entries.length === 0 && globalEnergy) {
    entries.push({ character: "", mood: "", energy: globalEnergy });
  } else {
    for (const e of entries) {
      if (!e.energy) e.energy = globalEnergy;
    }
  }
  return entries;
}

function parseBulletList(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^-\s+/, ""));
}

/** Strip `(added: YYYY-MM-DD)` suffix and return the text + date. */
function parseTimestampedItem(text: string): {
  text: string;
  createdAt?: string;
} {
  const match = text.match(/^(.+?)\s*\(added:\s*(\d{4}-\d{2}-\d{2})\)\s*$/);
  if (match) return { text: match[1]!.trim(), createdAt: match[2]! };
  return { text };
}

function parseTimestampedBulletList(
  content: string,
): { text: string; createdAt?: string }[] {
  return parseBulletList(content).map(parseTimestampedItem);
}

// --- Intermediate raw section store ---

interface RawSections {
  cast: RawCastEntry[];
  relationships: RawRelEntry[];
  appearance: RawAppEntry[];
  scene: { location: string; presentNames: string[]; atmosphere: string };
  demeanor: RawDemEntry[];
  openThreads: { text: string; createdAt?: string }[];
  hardFacts: { text: string; createdAt?: string }[];
  style: string[];
}

function emptyRawSections(): RawSections {
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

function parseRawSection(
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

// --- Entity registry builder (extracted for complexity) ---

function buildEntityRegistry(raw: RawSections): Entity[] {
  const entities: Entity[] = [];

  for (const c of raw.cast) {
    findOrCreateEntity(entities, c.name, c.isPlayer);
    const entity = findEntityByName(entities, c.name)!;
    entity.description = c.description;
    entity.isPlayerCharacter = c.isPlayer;
  }

  for (const r of raw.relationships) {
    findOrCreateEntity(entities, r.from);
    findOrCreateEntity(entities, r.to);
  }
  for (const a of raw.appearance) {
    findOrCreateEntity(entities, a.character);
  }
  for (const d of raw.demeanor) {
    if (d.character) findOrCreateEntity(entities, d.character);
  }
  for (const name of raw.scene.presentNames) {
    findOrCreateEntity(entities, name);
  }

  return entities;
}

/**
 * Safely resolve an entity name to its ID, creating the entity if it doesn't
 * exist rather than crashing with a non-null assertion.
 */
function resolveEntityId(entities: Entity[], name: string): string {
  return (
    findEntityByName(entities, name)?.id ??
    findOrCreateEntity(entities, name).id
  );
}

function resolveRawToState(
  raw: RawSections,
  entities: Entity[],
  custom: CustomSection[],
): StructuredStoryState {
  return {
    entities,
    relationships: raw.relationships.map((r) => ({
      fromEntityId: resolveEntityId(entities, r.from),
      toEntityId: resolveEntityId(entities, r.to),
      description: r.description,
      details: r.details,
    })),
    appearance: raw.appearance.map((a) => ({
      entityId: resolveEntityId(entities, a.character),
      attribute: a.attribute,
      description: a.description,
    })),
    scene: {
      location: raw.scene.location,
      presentEntityIds: raw.scene.presentNames.map((n) =>
        resolveEntityId(entities, n),
      ),
      atmosphere: raw.scene.atmosphere,
    },
    demeanor: raw.demeanor.map((d) => ({
      entityId: d.character
        ? resolveEntityId(entities, d.character)
        : (entities[0]?.id ?? ""),
      mood: d.mood,
      energy: d.energy,
    })),
    openThreads: raw.openThreads.map((d) => ({
      description: d.text,
      createdAt: d.createdAt,
    })),
    hardFacts: raw.hardFacts.map((f) => ({
      fact: f.text,
      createdAt: f.createdAt,
    })),
    style: raw.style,
    custom,
  };
}

// --- Main parser ---

export function parseMarkdownToStructured(
  markdown: string,
): StructuredStoryState {
  if (!markdown.trim()) return emptyStructuredState();

  const parts = markdown.split(/^## /m);
  const raw = emptyRawSections();
  const customSections: CustomSection[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    const newlineIdx = part.indexOf("\n");
    const heading =
      newlineIdx === -1 ? part.trim() : part.slice(0, newlineIdx).trim();
    const content = newlineIdx === -1 ? "" : part.slice(newlineIdx + 1).trim();

    const section = resolveSection(heading);
    if (!section) {
      customSections.push({ heading, content });
      continue;
    }
    parseRawSection(raw, section, content);
  }

  const entities = buildEntityRegistry(raw);
  return resolveRawToState(raw, entities, customSections);
}

// ---------------------------------------------------------------------------
// Structured → Markdown serializer (resolves entity IDs → names)
// ---------------------------------------------------------------------------

function serializeEntities(entities: Entity[]): string {
  return entities.map((e) => `- **${e.name}** — ${e.description}`).join("\n");
}

function serializeRelationships(
  rels: Relationship[],
  entities: Entity[],
): string {
  return rels
    .map((r) => {
      const from = resolveEntityName(entities, r.fromEntityId);
      const to = resolveEntityName(entities, r.toEntityId);
      let line = `- **${from} → ${to}**: ${r.description}`;
      if (r.details.length > 0) {
        line += "\n" + r.details.map((d) => `  - ${d}`).join("\n");
      }
      return line;
    })
    .join("\n");
}

function serializeCharacters(
  entries: AppearanceEntry[],
  entities: Entity[],
): string {
  // Group entries by entityId, preserving order
  const grouped = new Map<string, AppearanceEntry[]>();
  for (const e of entries) {
    const group = grouped.get(e.entityId) ?? [];
    group.push(e);
    grouped.set(e.entityId, group);
  }

  const blocks: string[] = [];
  for (const [entityId, items] of grouped) {
    const name = resolveEntityName(entities, entityId);
    const lines = items.map((e) => `- **${e.attribute}**: ${e.description}`);
    blocks.push(`### ${name}\n\n#### Appearance\n\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

function serializeScene(scene: SceneInfo, entities: Entity[]): string {
  const lines: string[] = [];
  lines.push(
    `- **Where/When**: ${scene.location || "[to be filled during play]"}`,
  );
  const present = scene.presentEntityIds.map((id) =>
    resolveEntityName(entities, id),
  );
  lines.push(
    `- **Who is present**: ${present.length > 0 ? present.join(", ") : "[to be filled during play]"}`,
  );
  if (scene.atmosphere) {
    lines.push(`- **Atmosphere**: ${scene.atmosphere}`);
  }
  return lines.join("\n");
}

function serializeDemeanor(
  entries: DemeanorEntry[],
  entities: Entity[],
): string {
  const lines: string[] = [];
  for (const e of entries) {
    const name = resolveEntityName(entities, e.entityId);
    if (e.mood) {
      lines.push(`- **${name ? `${name}'s mood` : "Mood"}**: ${e.mood}`);
    }
  }
  const energy = entries.find((e) => e.energy)?.energy;
  if (energy) {
    lines.push(`- **Energy between them**: ${energy}`);
  }
  return lines.join("\n");
}

function serializeBulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/** Format a date as YYYY-MM-DD for serialization. */
function toDateStr(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  // Handle both full ISO and YYYY-MM-DD
  return iso.slice(0, 10);
}

/** Sort comparator for createdAt fields (oldest first, undefined = oldest). */
function byCreatedAt(a?: string, b?: string): number {
  const da = a ?? "";
  const db = b ?? "";
  return da.localeCompare(db);
}

function serializeTimestampedList(
  items: { text: string; createdAt?: string }[],
): string {
  const sorted = [...items].sort((a, b) =>
    byCreatedAt(a.createdAt, b.createdAt),
  );
  return sorted
    .map((item) => `- ${item.text} (added: ${toDateStr(item.createdAt)})`)
    .join("\n");
}

export function structuredToMarkdown(state: StructuredStoryState): string {
  const { entities } = state;
  const sections: string[] = [];

  if (entities.length > 0) {
    sections.push(`## Cast\n\n${serializeEntities(entities)}`);
  }
  if (state.relationships.length > 0) {
    sections.push(
      `## Relationships\n\n${serializeRelationships(state.relationships, entities)}`,
    );
  }
  if (state.appearance.length > 0) {
    sections.push(
      `## Characters\n\n${serializeCharacters(state.appearance, entities)}`,
    );
  }
  sections.push(`## Scene\n\n${serializeScene(state.scene, entities)}`);
  if (state.demeanor.length > 0) {
    sections.push(
      `## Current Demeanor\n\n${serializeDemeanor(state.demeanor, entities)}`,
    );
  }
  if (state.openThreads.length > 0) {
    const threadItems = state.openThreads.map((t) => ({
      text: t.description,
      createdAt: t.createdAt,
    }));
    sections.push(
      `## Open Threads\n\n${serializeTimestampedList(threadItems)}`,
    );
  }
  if (state.hardFacts.length > 0) {
    const factItems = state.hardFacts.map((f) => ({
      text: f.fact,
      createdAt: f.createdAt,
    }));
    sections.push(
      `## Hard Facts (do not contradict these)\n\n${serializeTimestampedList(factItems)}`,
    );
  }
  if (state.style.length > 0) {
    sections.push(`## Style\n\n${serializeBulletList(state.style)}`);
  }
  for (const c of state.custom) {
    sections.push(`## ${c.heading}\n\n${c.content}`);
  }

  return sections.join("\n\n");
}
