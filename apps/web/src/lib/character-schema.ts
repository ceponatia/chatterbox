import type {
  CharacterAppearanceEntry,
  CharacterBehavioralProfile,
  CharacterIdentity,
  MutabilityTier,
} from "@/lib/story-project-types";

export type FieldType = "text" | "textarea" | "select" | "attribute-list" | "dialogue-examples";

export const DIALOGUE_EXAMPLE_TAGS = [
  "general",
  "angry",
  "casual",
  "formal",
  "playful",
  "sad",
  "excited",
  "sarcastic",
] as const;

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  defaultValue: string;
  required: boolean;
  tooltip: string;
  placeholder: string;
}

export interface SectionDefinition {
  id: string;
  label: string;
  optional: boolean;
  fields: FieldDefinition[];
}

export interface TabDefinition {
  id: string;
  label: string;
  sections: SectionDefinition[];
}

export const DEFAULT_APPEARANCE_ATTRIBUTES = [
  "eyes",
  "hair",
  "face",
  "build",
  "skin",
  "outfit",
  "vibe",
  "voice",
];

export const KNOWN_APPEARANCE_KEYS: Record<
  string,
  { mutabilityTier: MutabilityTier }
> = {
  eyes: { mutabilityTier: "stable" },
  hair: { mutabilityTier: "semi-stable" },
  face: { mutabilityTier: "stable" },
  build: { mutabilityTier: "semi-stable" },
  skin: { mutabilityTier: "stable" },
  outfit: { mutabilityTier: "mutable" },
  vibe: { mutabilityTier: "mutable" },
  voice: { mutabilityTier: "semi-stable" },
  mannerisms: { mutabilityTier: "mutable" },
};

export const PRONOUNS_OPTIONS = [
  "she/her",
  "he/him",
  "they/them",
  "it/its",
  "custom",
];

export const ROLE_OPTIONS = ["primary", "supporting", "minor"];

export const CHARACTER_TABS: TabDefinition[] = [
  {
    id: "identity",
    label: "Identity",
    sections: [
      {
        id: "core",
        label: "Core details",
        optional: false,
        fields: [
          {
            key: "name",
            label: "Name",
            type: "text",
            options: undefined,
            defaultValue: "",
            required: true,
            tooltip: "Display name used in the story and builder.",
            placeholder: "Captain Mara Voss",
          },
          {
            key: "role",
            label: "Role in story",
            type: "select",
            options: ROLE_OPTIONS,
            defaultValue: "supporting",
            required: true,
            tooltip: "How central this character is to the story.",
            placeholder: "Select role",
          },
          {
            key: "roleTitle",
            label: "Role or title",
            type: "text",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "The in-world job, title, or identity label for the character.",
            placeholder: "Quartermaster, detective, heir",
          },
          {
            key: "age",
            label: "Age",
            type: "text",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip: "Approximate age or age range.",
            placeholder: "Late 20s",
          },
          {
            key: "pronouns",
            label: "Pronouns",
            type: "select",
            options: PRONOUNS_OPTIONS,
            defaultValue: "",
            required: false,
            tooltip: "Narrative pronouns used for the character.",
            placeholder: "Select pronouns",
          },
          {
            key: "species",
            label: "Species",
            type: "text",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip: "Species, ancestry, or biological category if relevant.",
            placeholder: "Human, android, dryad",
          },
          {
            key: "situation",
            label: "Current situation",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "Where this character starts, what they are dealing with, and why they matter now.",
            placeholder: "Running a failing inn while hiding a stolen relic.",
          },
        ],
      },
      {
        id: "background",
        label: "Background",
        optional: true,
        fields: [
          {
            key: "background",
            label: "Background",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "Past history that explains the character's worldview and habits.",
            placeholder:
              "Former navy mechanic who disappeared after a failed mutiny.",
          },
        ],
      },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    sections: [
      {
        id: "appearance-list",
        label: "Appearance attributes",
        optional: true,
        fields: [
          {
            key: "appearance",
            label: "Appearance",
            type: "attribute-list",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip: "A flexible list of physical or sensory details.",
            placeholder: "Add an attribute and describe it",
          },
        ],
      },
    ],
  },
  {
    id: "behavior",
    label: "Behavior",
    sections: [
      {
        id: "overview",
        label: "Overview",
        optional: false,
        fields: [
          {
            key: "overview",
            label: "Overview",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: true,
            tooltip:
              "High-level summary of how the character thinks and reacts.",
            placeholder:
              "Guarded, dryly funny, and quicker to observe than to speak.",
          },
        ],
      },
      {
        id: "speechPatterns",
        label: "Speech patterns",
        optional: false,
        fields: [
          {
            key: "speechPatterns",
            label: "Speech patterns",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "Cadence, rhythm, sentence structure, or recurring delivery habits.",
            placeholder:
              "Short sentences, clipped pauses, rarely uses contractions.",
          },
        ],
      },
      {
        id: "vocabulary",
        label: "Vocabulary",
        optional: false,
        fields: [
          {
            key: "vocabulary",
            label: "Vocabulary",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip: "Favorite word choices, slang, and level of formality.",
            placeholder:
              "Naval jargon, technical metaphors, dry understatement.",
          },
        ],
      },
      {
        id: "emotionalTexture",
        label: "Emotional texture",
        optional: true,
        fields: [
          {
            key: "emotionalTexture",
            label: "Emotional texture",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "What emotions sit close to the surface and what stays buried.",
            placeholder:
              "Irritation shows quickly, affection leaks out sideways.",
          },
        ],
      },
      {
        id: "withPlayer",
        label: "With the player",
        optional: true,
        fields: [
          {
            key: "withPlayer",
            label: "With the player",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "How this character usually behaves toward the player character.",
            placeholder: "Protective, skeptical, and slightly too honest.",
          },
        ],
      },
      {
        id: "commonMistakes",
        label: "Common mistakes",
        optional: true,
        fields: [
          {
            key: "commonMistakes",
            label: "Common mistakes",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "Blind spots, recurring misreads, or habits that create trouble.",
            placeholder:
              "Assumes competence, withholds context, doubles down when embarrassed.",
          },
        ],
      },
      {
        id: "mannerisms",
        label: "Mannerisms",
        optional: false,
        fields: [
          {
            key: "mannerisms",
            label: "Mannerisms",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "Physical tics, gestures, posture habits, and nonverbal signatures.",
            placeholder:
              "Taps ring finger against mugs, glances at exits before sitting.",
          },
        ],
      },
      {
        id: "dialogueExamples",
        label: "Dialogue examples",
        optional: true,
        fields: [
          {
            key: "dialogueExamples",
            label: "Dialogue examples",
            type: "dialogue-examples" as FieldType,
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "Concrete lines of dialogue that demonstrate how this character speaks. Use short, distinctive lines that capture the character's voice. Include a mix of emotional registers to show different facets of their personality.",
            placeholder: "Write a line of dialogue this character would say.",
          },
        ],
      },
    ],
  },
  {
    id: "demeanor",
    label: "Demeanor",
    sections: [
      {
        id: "starting-demeanor",
        label: "Starting demeanor",
        optional: true,
        fields: [
          {
            key: "startingDemeanor",
            label: "Starting demeanor",
            type: "textarea",
            options: undefined,
            defaultValue: "",
            required: false,
            tooltip:
              "The mood or posture this character starts play with before the first turn happens.",
            placeholder:
              "Tired but sharp, carrying yesterday's anger under tight control.",
          },
        ],
      },
    ],
  },
  {
    id: "source",
    label: "Source",
    sections: [],
  },
];

export type CharacterBuilderTabId = (typeof CHARACTER_TABS)[number]["id"];

export function createEmptyCharacterIdentity(): CharacterIdentity {
  return {
    age: "",
    role: "",
    situation: "",
    pronouns: "",
    species: "",
  };
}

export function createEmptyBehavioralProfile(): CharacterBehavioralProfile {
  return {
    overview: "",
    speechPatterns: "",
    vocabulary: "",
    emotionalTexture: "",
    withPlayer: "",
    commonMistakes: "",
    mannerisms: "",
  };
}

export function createDefaultAppearanceEntries(): CharacterAppearanceEntry[] {
  return DEFAULT_APPEARANCE_ATTRIBUTES.map((attribute) => ({
    attribute,
    value: "",
  }));
}
