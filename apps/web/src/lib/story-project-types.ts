import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import type {
  RelationshipTone,
  StructuredStoryState,
} from "@chatterbox/state-model";

export type StoryAuthoringMode = "form" | "imported" | "hybrid";

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

export type FieldProvenance = "imported" | "form";

export interface CharacterProvenance {
  identity?: FieldProvenance;
  background?: FieldProvenance;
  appearance?: FieldProvenance;
  behavioralProfile?: FieldProvenance;
  startingDemeanor?: FieldProvenance;
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
  importedMarkdown: string | null;
  provenance: CharacterProvenance | null;
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

export interface StoryProjectSummary {
  id: string;
  name: string;
  description: string;
  authoringMode: StoryAuthoringMode;
  createdAt: string;
  updatedAt: string;
  characterCount: number;
  relationshipCount: number;
}

/** Segment ID to content override map for form-based system prompt editing. */
export type SegmentOverrides = Record<string, string>;

export interface StoryProjectDetail extends StoryProjectSummary {
  importedSystemPrompt: string | null;
  importedStoryState: string | null;
  generatedSystemPrompt: string;
  generatedStoryState: string;
  generatedSegments: SerializedSegment[] | null;
  generatedStructuredState: StructuredStoryState | null;
  segmentOverrides: SegmentOverrides | null;
  characters: StoryCharacterRecord[];
  relationships: StoryRelationshipRecord[];
}

export interface StoryProjectInput {
  name: string;
  description: string;
  segmentOverrides?: SegmentOverrides | null;
}

export interface StoryProjectDuplicateInput {
  duplicateFromId: string;
  name?: string;
}

export interface StoryProjectImportCharacterInput {
  name?: string;
  role?: string;
  markdown: string;
}

export interface StoryProjectImportInput {
  systemPromptMarkdown?: string;
  storyStateMarkdown?: string;
  characters?: StoryProjectImportCharacterInput[];
}

export interface StoryProjectCharacterInput {
  name: string;
  role: string;
  isPlayer?: boolean;
  entityId?: string;
  importedMarkdown?: string | null;
  identity?: CharacterIdentity | null;
  background?: string | null;
  appearance?: CharacterAppearanceEntry[] | null;
  behavioralProfile?: CharacterBehavioralProfile | null;
  dialogueExamples?: DialogueExample[] | null;
  startingDemeanor?: string | null;
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
  authoringMode: StoryAuthoringMode;
  importedSystemPrompt: string | null;
  importedStoryState: string | null;
  generatedSystemPrompt: string;
  generatedStoryState: string;
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
    importedMarkdown: string | null;
    provenance: CharacterProvenance | null;
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
