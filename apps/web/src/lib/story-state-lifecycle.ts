import {
  normalizeSectionMeta,
  type Entity,
  type HardFact,
  type StoryThread,
  type StructuredStoryState,
} from "@/lib/story-state-types";
import {
  deriveThreadHook,
  generateStoryItemId,
  inferAttributeCategory,
  inferFactTags,
  inferRelationshipTone,
  normalizeTextKey,
  summarizeFact,
} from "@/lib/story-state-inference";

function hydrateHardFact(
  previousFacts: Map<string, HardFact>,
  fact: HardFact,
  today: string,
): HardFact {
  const match = previousFacts.get(normalizeTextKey(fact.fact));
  return {
    ...fact,
    summary: fact.summary ?? match?.summary ?? summarizeFact(fact.fact),
    tags: fact.tags ?? match?.tags ?? inferFactTags(fact.fact),
    createdAt: match?.createdAt ?? fact.createdAt ?? today,
    establishedAt: match?.establishedAt ?? fact.establishedAt ?? today,
    lastConfirmedAt: match?.lastConfirmedAt ?? fact.lastConfirmedAt ?? today,
    superseded: false,
    supersededBy: undefined,
  };
}

function hydrateThread(
  previousThreadsById: Map<string, StoryThread>,
  previousThreadsByText: Map<string, StoryThread>,
  thread: StoryThread,
  today: string,
): StoryThread {
  const match =
    previousThreadsById.get(thread.id) ??
    previousThreadsByText.get(normalizeTextKey(thread.description));

  return {
    ...thread,
    id:
      match?.id ??
      thread.id ??
      generateStoryItemId("thread", thread.description),
    hook: thread.hook ?? match?.hook ?? deriveThreadHook(thread.description),
    resolutionHint: thread.resolutionHint || match?.resolutionHint || "",
    closureRationale: thread.closureRationale ?? match?.closureRationale,
    lastReferencedAt:
      match?.lastReferencedAt ??
      thread.lastReferencedAt ??
      thread.createdAt ??
      today,
    status: thread.status ?? match?.status ?? "active",
    evolvedInto: match?.evolvedInto ?? thread.evolvedInto,
    createdAt: match?.createdAt ?? thread.createdAt ?? today,
  };
}

/**
 * Carry forward `isPlayerCharacter` from previous entities so the LLM
 * cannot accidentally strip the player flag during state updates.
 */
function preservePlayerFlag(previous: Entity[], incoming: Entity[]): Entity[] {
  const playerNames = new Set(
    previous
      .filter((entity) => entity.isPlayerCharacter)
      .map((entity) => entity.name.toLowerCase().trim()),
  );
  if (playerNames.size === 0) return incoming;

  return incoming.map((entity) =>
    playerNames.has(entity.name.toLowerCase().trim())
      ? { ...entity, isPlayerCharacter: true }
      : entity,
  );
}

export function reconcileLifecycleState(
  previous: StructuredStoryState | null,
  incoming: StructuredStoryState,
): StructuredStoryState {
  if (!previous) return incoming;

  const today = new Date().toISOString().slice(0, 10);
  const previousFacts = new Map(
    previous.hardFacts.map((fact) => [normalizeTextKey(fact.fact), fact]),
  );
  const nextFacts = incoming.hardFacts.map((fact) =>
    hydrateHardFact(previousFacts, fact, today),
  );

  const nextFactKeys = new Set(
    nextFacts.map((fact) => normalizeTextKey(fact.fact)),
  );
  const archivedFacts = previous.hardFacts
    .filter((fact) => !nextFactKeys.has(normalizeTextKey(fact.fact)))
    .map((fact) => ({
      ...fact,
      superseded: true,
      supersededBy:
        fact.supersededBy ?? `Superseded during state update on ${today}`,
    }));

  const previousThreadsById = new Map(
    previous.openThreads.map((thread) => [thread.id, thread]),
  );
  const previousThreadsByText = new Map(
    previous.openThreads.map((thread) => [
      normalizeTextKey(thread.description),
      thread,
    ]),
  );
  const nextThreads = incoming.openThreads.map((thread) =>
    hydrateThread(previousThreadsById, previousThreadsByText, thread, today),
  );

  const nextThreadIds = new Set(nextThreads.map((thread) => thread.id));
  const archivedThreads = previous.openThreads
    .filter((thread) => !nextThreadIds.has(thread.id))
    .map((thread) => ({
      ...thread,
      status:
        thread.status === "resolved" || thread.status === "stale"
          ? thread.status
          : "resolved",
      closureRationale:
        thread.closureRationale ?? `Removed during state update on ${today}`,
    }));

  return {
    ...incoming,
    entities: preservePlayerFlag(previous.entities, incoming.entities),
    hardFacts: [...nextFacts, ...archivedFacts],
    openThreads: [...nextThreads, ...archivedThreads],
    sectionMeta: normalizeSectionMeta(previous.sectionMeta),
  };
}

export function ensureLifecycleDefaults(
  state: StructuredStoryState,
): StructuredStoryState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...state,
    relationships: state.relationships.map((relationship) => ({
      ...relationship,
      tone:
        relationship.tone ?? inferRelationshipTone(relationship.description),
    })),
    appearance: state.appearance.map((entry) => ({
      ...entry,
      category:
        entry.category ??
        inferAttributeCategory(entry.attribute, entry.description),
    })),
    openThreads: state.openThreads.map((thread) => ({
      id: thread.id ?? generateStoryItemId("thread", thread.description),
      description: thread.description,
      hook: thread.hook ?? deriveThreadHook(thread.description),
      resolutionHint: thread.resolutionHint ?? "",
      closureRationale: thread.closureRationale,
      lastReferencedAt: thread.lastReferencedAt ?? thread.createdAt ?? today,
      status: thread.status ?? "active",
      evolvedInto: thread.evolvedInto,
      createdAt: thread.createdAt ?? today,
    })),
    hardFacts: state.hardFacts.map((fact) => ({
      fact: fact.fact,
      summary: fact.summary ?? summarizeFact(fact.fact),
      tags: fact.tags ?? inferFactTags(fact.fact),
      createdAt: fact.createdAt ?? today,
      establishedAt: fact.establishedAt ?? fact.createdAt ?? today,
      lastConfirmedAt: fact.lastConfirmedAt ?? fact.createdAt ?? today,
      superseded: fact.superseded ?? false,
      supersededBy: fact.supersededBy,
    })),
    sectionMeta: normalizeSectionMeta(state.sectionMeta),
  };
}
