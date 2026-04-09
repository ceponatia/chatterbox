// Types
export type {
  AppearanceEntry,
  AttributeCategory,
  BehavioralCategory,
  CustomSection,
  DemeanorEntry,
  Entity,
  FactTag,
  HardFact,
  Relationship,
  RelationshipTone,
  SceneInfo,
  SectionMeta,
  SectionMetaKey,
  StoryThread,
  StructuredStoryState,
} from "./types.js";

// Type helpers and empty state
export { applySectionMetaTransition, emptyStructuredState } from "./types.js";

// Entity operations
export {
  findEntityByName,
  findOrCreateEntity,
  reconcileEntities,
  remapEntityIds,
  resolveEntityName,
} from "./entities.js";

// Lifecycle
export {
  ensureLifecycleDefaults,
  reconcileLifecycleState,
} from "./lifecycle.js";

// Parser
export { parseMarkdownToStructured } from "./parser.js";

// Serializer
export { structuredToMarkdown } from "./serializer.js";

// Presence scanner
export { scanPresenceFromAssistantMessage } from "./presence-scanner.js";

// Effective state resolver
export { resolveEffectiveState } from "./effective-state.js";
export type { EffectiveStateInput } from "./effective-state.js";
