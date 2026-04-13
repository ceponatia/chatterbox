import type { Entity } from "./types";

export interface DerivePresenceParams {
  entities: Entity[];
  sceneLocationId: string;
  manualOverrides?: {
    addEntityIds: string[];
    removeEntityIds: string[];
  };
  onEntityBecamePresent?: (entityId: string) => void;
  onEntityBecameAbsent?: (entityId: string) => void;
}

export function derivePresenceFromLocations(
  params: DerivePresenceParams,
): string[] {
  const { entities, sceneLocationId, manualOverrides } = params;

  // Start with entities whose locationId matches sceneLocationId
  const coLocated = new Set(
    entities
      .filter((e) => e.locationId === sceneLocationId)
      .map((e) => e.id),
  );

  // Always include the player character
  for (const e of entities) {
    if (e.isPlayerCharacter) coLocated.add(e.id);
  }

  // Apply manual overrides
  if (manualOverrides) {
    for (const id of manualOverrides.addEntityIds) {
      coLocated.add(id);
    }
    for (const id of manualOverrides.removeEntityIds) {
      coLocated.delete(id);
    }
  }

  return [...coLocated];
}
