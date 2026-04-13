import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import type {
  RelationshipTone,
  StructuredStoryState,
} from "@chatterbox/state-model";
import type { SensoryProfile } from "@/lib/sensory-schema";

export interface PromptBlueprintSection {
  id: string;
  label: string;
  content: string;
  order: number;
}

export interface PromptBlueprint {
  setting: string;
  themes: string;
  coreRules: string;
  outputFormat: string;
  npcFraming: string;
  narrationGuidelines: string;
  interactionGuidelines: string;
  customSections: PromptBlueprintSection[];
  customizedFields?: Partial<Record<string, boolean>>;
}

export interface RuntimeSeed {
  openingScene: string;
  openThreads: string[];
  hardFacts: string[];
  customState: string;
}

export interface DialogueExample {
  text: string;
  tag: string;
}

export interface CharacterIdentity {
  age: string;
  role: string;
  situation: string;
  pronouns: string;
  species: string;
}

export type MutabilityTier = "stable" | "semi-stable" | "mutable";

export interface CharacterAppearanceEntry {
  attribute: string;
  value: string;
  mutabilityTier?: MutabilityTier;
}

export interface CharacterBehavioralProfile {
  overview: string;
  speechPatterns: string;
  vocabulary: string;
  emotionalTexture: string;
  withPlayer: string;
  commonMistakes: string;
  mannerisms: string;
}

export interface StoryCharacterRecord {
  id: string;
  storyProjectId: string;
  entityId: string;
  name: string;
  role: string;
  isPlayer: boolean;
  identity: CharacterIdentity | null;
  background: string | null;
  appearance: CharacterAppearanceEntry[] | null;
  behavioralProfile: CharacterBehavioralProfile | null;
  dialogueExamples: DialogueExample[] | null;
  startingDemeanor: string | null;
  sensoryProfile: SensoryProfile | null;
  defaultLocationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoryRelationshipRecord {
  id: string;
  storyProjectId: string;
  fromEntityId: string;
  toEntityId: string;
  description: string;
  details: string[];
  tone: RelationshipTone | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocationConnectionRecord {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  toLocationName: string;
  description: string | null;
  bidirectional: boolean;
  traversalHint: string | null;
}

export interface StoryLocationRecord {
  id: string;
  storyProjectId: string;
  name: string;
  description: string;
  tags: string[];
  atmosphere: string;
  sortOrder: number;
  connections: LocationConnectionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface StoryLocationInput {
  name: string;
  description?: string;
  tags?: string[];
  atmosphere?: string;
  sortOrder?: number;
}

export interface LocationConnectionInput {
  toLocationId: string;
  description?: string | null;
  bidirectional?: boolean;
  traversalHint?: string | null;
}

export interface StoryProjectSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  characterCount: number;
  relationshipCount: number;
  locationCount: number;
}

export interface StoryProjectDetail extends StoryProjectSummary {
  generatedSystemPrompt: string;
  generatedStoryState: string;
  generatedSegments: SerializedSegment[] | null;
  generatedStructuredState: StructuredStoryState | null;
  mainEntityId: string | null;
  promptBlueprint: PromptBlueprint | null;
  runtimeSeed: RuntimeSeed | null;
  characters: StoryCharacterRecord[];
  relationships: StoryRelationshipRecord[];
  locations: StoryLocationRecord[];
}

export interface StoryProjectInput {
  name: string;
  description: string;
  mainEntityId?: string | null;
  promptBlueprint?: PromptBlueprint | null;
  runtimeSeed?: RuntimeSeed | null;
}

export interface StoryProjectDuplicateInput {
  duplicateFromId: string;
  name?: string;
}

export interface StoryProjectCharacterInput {
  name: string;
  role: string;
  isPlayer?: boolean;
  entityId?: string;
  identity?: CharacterIdentity | null;
  background?: string | null;
  appearance?: CharacterAppearanceEntry[] | null;
  behavioralProfile?: CharacterBehavioralProfile | null;
  dialogueExamples?: DialogueExample[] | null;
  startingDemeanor?: string | null;
  sensoryProfile?: SensoryProfile | null;
  defaultLocationId?: string | null;
}

export interface StoryProjectRelationshipInput {
  fromEntityId: string;
  toEntityId: string;
  description: string;
  details?: string[];
  tone?: RelationshipTone | null;
}

export interface StoryProjectExportPayload {
  storyProjectId: string;
  name: string;
  description: string;
  generatedSystemPrompt: string;
  generatedStoryState: string;
  mainEntityId: string | null;
  promptBlueprint: PromptBlueprint | null;
  runtimeSeed: RuntimeSeed | null;
  characters: Array<{
    id: string;
    entityId: string;
    name: string;
    role: string;
    isPlayer: boolean;
    identity: CharacterIdentity | null;
    background: string | null;
    appearance: CharacterAppearanceEntry[] | null;
    behavioralProfile: CharacterBehavioralProfile | null;
    dialogueExamples: DialogueExample[] | null;
    startingDemeanor: string | null;
    sensoryProfile: SensoryProfile | null;
  }>;
  relationships: StoryRelationshipRecord[];
}

export interface StoryProjectLaunchResult {
  conversationId: string;
  storyProjectId: string;
}

export interface StoryProjectArtifacts {
  generatedSystemPrompt: string;
  generatedStoryState: string;
  generatedSegments: SerializedSegment[];
  generatedStructuredState: StructuredStoryState;
}
