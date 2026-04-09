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
} from "@/lib/story-state-types";

export {
  applySectionMetaTransition,
  emptyStructuredState,
} from "@/lib/story-state-types";

export {
  findEntityByName,
  findOrCreateEntity,
  reconcileEntities,
  remapEntityIds,
  resolveEntityName,
} from "@/lib/story-state-entities";

export {
  ensureLifecycleDefaults,
  reconcileLifecycleState,
} from "@/lib/story-state-lifecycle";

export { parseMarkdownToStructured } from "@/lib/story-state-parser";
export { structuredToMarkdown } from "@/lib/story-state-serializer";
