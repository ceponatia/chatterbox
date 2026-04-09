import type { Entity, StructuredStoryState } from "@/lib/story-state-types";

let idCounter = 0;

function generateEntityId(): string {
  return `e-${Date.now()}-${++idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function resolveEntityName(entities: Entity[], id: string): string {
  return entities.find((entity) => entity.id === id)?.name ?? id;
}

export function findEntityByName(
  entities: Entity[],
  name: string,
): Entity | undefined {
  const lower = name.toLowerCase().trim();
  const exact = entities.find(
    (entity) => entity.name.toLowerCase().trim() === lower,
  );
  if (exact) return exact;

  const queryTokens = lower.split(/\s+/);
  const partials = entities.filter((entity) => {
    const entityTokens = entity.name.toLowerCase().trim().split(/\s+/);
    return (
      queryTokens.every((queryToken) =>
        entityTokens.some((entityToken) => entityToken === queryToken),
      ) ||
      entityTokens.every((entityToken) =>
        queryTokens.some((queryToken) => queryToken === entityToken),
      )
    );
  });

  return partials.length === 1 ? partials[0] : undefined;
}

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

export function reconcileEntities(
  existing: Entity[],
  incoming: Entity[],
): { entities: Entity[]; idRemap: Record<string, string> } {
  const entities: Entity[] = [];
  const matched = new Set<string>();
  const seen = new Set<string>();
  const idRemap: Record<string, string> = {};

  for (const incomingEntity of incoming) {
    const normalizedName = incomingEntity.name.toLowerCase().trim();
    if (seen.has(normalizedName)) continue;
    seen.add(normalizedName);

    const match = findEntityByName(existing, incomingEntity.name);
    if (!match) {
      entities.push(incomingEntity);
      continue;
    }

    entities.push({
      ...match,
      description: incomingEntity.description,
      isPlayerCharacter: incomingEntity.isPlayerCharacter,
    });
    matched.add(match.id);
    if (incomingEntity.id !== match.id) {
      idRemap[incomingEntity.id] = match.id;
    }
  }

  for (const entity of existing) {
    if (!matched.has(entity.id)) {
      entities.push(entity);
    }
  }

  return { entities, idRemap };
}

export function remapEntityIds(
  state: StructuredStoryState,
  idRemap: Record<string, string>,
): StructuredStoryState {
  if (Object.keys(idRemap).length === 0) return state;

  const remap = (id: string) => idRemap[id] ?? id;
  return {
    ...state,
    relationships: state.relationships.map((relationship) => ({
      ...relationship,
      fromEntityId: remap(relationship.fromEntityId),
      toEntityId: remap(relationship.toEntityId),
    })),
    appearance: state.appearance.map((entry) => ({
      ...entry,
      entityId: remap(entry.entityId),
    })),
    scene: {
      ...state.scene,
      presentEntityIds: state.scene.presentEntityIds.map(remap),
    },
    demeanor: state.demeanor.map((entry) => ({
      ...entry,
      entityId: remap(entry.entityId),
    })),
  };
}
