import {
  normalizeSectionMeta,
  type Entity,
  type HardFact,
  type StoryThread,
  type StructuredStoryState,
} from "./types";
import {
  deriveThreadHook,
  generateStoryItemId,
  inferAttributeCategory,
  inferFactTags,
  inferRelationshipTone,
  normalizeTextKey,
  summarizeFact,
} from "./inference";

function resolveFactContent(
  fact: HardFact,
  match: HardFact | undefined,
): Pick<HardFact, "summary" | "tags"> {
  return {
    summary: fact.summary ?? match?.summary ?? summarizeFact(fact.fact),
    tags: fact.tags ?? match?.tags ?? inferFactTags(fact.fact),
  };
}

function resolveFactDates(
  fact: HardFact,
  match: HardFact | undefined,
  today: string,
): Pick<HardFact, "createdAt" | "establishedAt" | "lastConfirmedAt"> {
  return {
    createdAt: match?.createdAt ?? fact.createdAt ?? today,
    establishedAt: match?.establishedAt ?? fact.establishedAt ?? today,
    lastConfirmedAt: match?.lastConfirmedAt ?? fact.lastConfirmedAt ?? today,
  };
}

function hydrateHardFact(
  previousFacts: Map<string, HardFact>,
  fact: HardFact,
  today: string,
): HardFact {
  const match = previousFacts.get(normalizeTextKey(fact.fact));
  return {
    ...fact,
    ...resolveFactContent(fact, match),
    ...resolveFactDates(fact, match, today),
    superseded: false,
    supersededBy: undefined,
  };
}

function resolveThreadIdentity(
  thread: StoryThread,
  match: StoryThread | undefined,
): Pick<StoryThread, "id" | "hook"> {
  return {
    id:
      match?.id ??
      thread.id ??
      generateStoryItemId("thread", thread.description),
    hook: thread.hook ?? match?.hook ?? deriveThreadHook(thread.description),
  };
}

function resolveThreadStatus(
  thread: StoryThread,
  match: StoryThread | undefined,
): Pick<
  StoryThread,
  "status" | "closureRationale" | "evolvedInto" | "resolutionHint"
> {
  return {
    status: thread.status ?? match?.status ?? "active",
    closureRationale: thread.closureRationale ?? match?.closureRationale,
    evolvedInto: match?.evolvedInto ?? thread.evolvedInto,
    resolutionHint: thread.resolutionHint || match?.resolutionHint || "",
  };
}

function resolveThreadDates(
  thread: StoryThread,
  match: StoryThread | undefined,
  today: string,
): Pick<StoryThread, "createdAt" | "lastReferencedAt"> {
  return {
    createdAt: match?.createdAt ?? thread.createdAt ?? today,
    lastReferencedAt:
      match?.lastReferencedAt ??
      thread.lastReferencedAt ??
      thread.createdAt ??
      today,
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
    ...resolveThreadIdentity(thread, match),
    ...resolveThreadStatus(thread, match),
    ...resolveThreadDates(thread, match, today),
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
  today: string = new Date().toISOString().slice(0, 10),
): StructuredStoryState {
  if (!previous) return incoming;

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
  today: string = new Date().toISOString().slice(0, 10),
): StructuredStoryState {
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
