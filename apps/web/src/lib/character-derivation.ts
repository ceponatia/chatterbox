import {
  estimateTokens,
  type SerializedSegment,
} from "@chatterbox/prompt-assembly";
import type {
  CharacterAppearanceEntry,
  CharacterBehavioralProfile,
  DialogueExample,
  StoryCharacterRecord,
} from "@/lib/story-project-types";
import type {
  AppearanceEntry,
  AttributeCategory,
  DemeanorEntry,
  Entity,
} from "@chatterbox/state-model";

const SHARED_BEHAVIOR_FIELDS = [
  ["Emotional texture", "emotionalTexture"],
  ["Common mistakes", "commonMistakes"],
] as const;

const NPC_ONLY_BEHAVIOR_FIELDS = [
  ["Speech patterns", "speechPatterns"],
  ["Vocabulary", "vocabulary"],
  ["With player", "withPlayer"],
  ["Mannerisms", "mannerisms"],
] as const;

const ATTRIBUTE_TO_CATEGORY: Record<string, AttributeCategory> = {
  eyes: "face",
  face: "face",
  skin: "face",
  hair: "hair",
  build: "build",
  outfit: "outfit",
  voice: "voice",
  vibe: "presence",
  mannerisms: "movement",
};

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildBehaviorSection(
  label: string,
  value: string | null,
): string | null {
  if (!value) return null;
  return `### ${label}\n${value}`;
}

function pushBehaviorSection(
  sections: string[],
  label: string,
  value: string | null,
): void {
  const section = buildBehaviorSection(label, value);
  if (section) sections.push(section);
}

function collectBehaviorSections(
  profile: CharacterBehavioralProfile | null,
  isPlayer: boolean,
): string[] {
  const sections: string[] = [];

  for (const [label, field] of SHARED_BEHAVIOR_FIELDS) {
    pushBehaviorSection(sections, label, trimToNull(profile?.[field]));
  }

  if (!isPlayer) {
    for (const [label, field] of NPC_ONLY_BEHAVIOR_FIELDS) {
      pushBehaviorSection(sections, label, trimToNull(profile?.[field]));
    }
  }

  return sections;
}

function buildDialogueExamplesSection(
  name: string,
  examples: DialogueExample[] | null | undefined,
): string | null {
  if (!examples || examples.length === 0) return null;

  const grouped = new Map<string, string[]>();
  for (const example of examples) {
    const tag = example.tag || "general";
    const list = grouped.get(tag);
    if (list) {
      list.push(example.text);
    } else {
      grouped.set(tag, [example.text]);
    }
  }

  const lines: string[] = [
    "### Dialogue examples",
    `These examples show how ${name} tends to speak. Use them as voice and tone reference, not lines to repeat verbatim.`,
  ];

  for (const [tag, texts] of grouped) {
    const label = tag === "general" ? "**General:**" : `**When ${tag}:**`;
    lines.push("", label);
    for (const text of texts) {
      lines.push(`> "${text}"`);
    }
  }

  return lines.join("\n");
}

export function deriveEntity(character: StoryCharacterRecord): Entity {
  const role =
    trimToNull(character.identity?.role) ??
    trimToNull(character.role) ??
    "supporting";

  const age = trimToNull(character.identity?.age);
  const situation = trimToNull(character.identity?.situation);

  const parts: string[] = [];
  if (age) parts.push(age);
  parts.push(role);
  if (situation) parts.push(situation);

  return {
    id: character.entityId,
    name: character.name,
    description: parts.join(", "),
    isPlayerCharacter: character.isPlayer,
  };
}

export function deriveAppearanceEntries(
  entityId: string,
  appearance: CharacterAppearanceEntry[] | null,
): AppearanceEntry[] {
  if (!entityId || !appearance?.length) return [];

  return appearance.flatMap((entry) => {
    const attribute = trimToNull(entry.attribute);
    const description = trimToNull(entry.value);
    if (!attribute || !description) return [];

    const category = ATTRIBUTE_TO_CATEGORY[attribute.toLowerCase()];
    return [
      {
        entityId,
        attribute,
        description,
        ...(category ? { category } : {}),
      },
    ];
  });
}

export function deriveDemeanorEntry(
  entityId: string,
  startingDemeanor: string | null,
): DemeanorEntry | null {
  const mood = trimToNull(startingDemeanor);
  if (!entityId || !mood) return null;

  return {
    entityId,
    mood,
    energy: "",
  };
}

export function deriveBehaviorSegment(
  character: StoryCharacterRecord,
): SerializedSegment | null {
  const profile = character.behavioralProfile;
  const overview = trimToNull(profile?.overview);
  if (!overview) return null;

  const isPlayer = character.isPlayer;
  const sections = collectBehaviorSections(profile, isPlayer);

  const background = trimToNull(character.background);

  const name = trimToNull(character.name) ?? "Character";
  const lines = [`# ${name} -- Behavioral Profile`, "", overview];
  if (background) lines.push("", `### Background\n${background}`);
  const contentParts = lines
    .concat(sections.flatMap((section) => ["", section]))
    .join("\n")
    .trim();

  const dialogueSection = buildDialogueExamplesSection(
    name,
    character.dialogueExamples,
  );
  const content = dialogueSection
    ? `${contentParts}\n\n${dialogueSection}`
    : contentParts;

  return {
    id: `character_behavior_${character.entityId}`,
    label: `${name} Behavior Profile`,
    content,
    policy: { type: "on_presence", entityId: character.entityId },
    priority: "high",
    order: 35,
    category: "character",
    tokenEstimate: estimateTokens(content),
    omittedSummary: `Behavior profile for ${name}`,
  };
}
