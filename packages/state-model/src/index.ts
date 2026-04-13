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
  LocationConnectionInfo,
  LocationInfo,
  Relationship,
  RelationshipTone,
  SceneInfo,
  SectionMeta,
  SectionMetaKey,
  StoryThread,
  StructuredStoryState,
} from "./types";

// Type helpers and empty state
export { applySectionMetaTransition, emptyStructuredState } from "./types";

// Entity operations
export {
  findEntityByName,
  findOrCreateEntity,
  reconcileEntities,
  remapEntityIds,
  resolveEntityName,
} from "./entities";

// Lifecycle
export { ensureLifecycleDefaults, reconcileLifecycleState } from "./lifecycle";

// Parser
export { parseMarkdownToStructured } from "./parser";

// Serializer
export { structuredToMarkdown } from "./serializer";

// Presence scanner
export { scanPresenceFromAssistantMessage } from "./presence-scanner";

// Effective state resolver
export { resolveEffectiveState } from "./effective-state";
export type { EffectiveStateInput } from "./effective-state";

// Location scanner
export { scanLocationChangesFromAssistantMessage } from "./location-scanner";
export type {
  LocationChangeResult,
  LocationScanParams,
} from "./location-scanner";

// Presence derivation
export { derivePresenceFromLocations } from "./presence-derivation";
export type { DerivePresenceParams } from "./presence-derivation";

// Structural validation
export {
  validateStructuralIntegrity,
  applyStructuralRepairs,
} from "./structural-validation";
export type {
  IntegrityIssue,
  IntegrityIssueKind,
  IntegrityReport,
  IntegrityRepairResult,
  IssueSeverity,
} from "./structural-validation";
