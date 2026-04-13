import { tool, jsonSchema } from "ai";
import {
  type StructuredStoryState,
  resolveEntityName,
} from "@chatterbox/state-model";

interface MoveToLocationInput {
  locationName: string;
  entityNames?: string[];
}

/**
 * Create the move_to_location tool that mutates the structured state in place.
 * The caller is responsible for serializing the mutated state after streaming.
 */
export function createMoveToLocationTool(
  structured: StructuredStoryState,
) {
  return tool({
    description:
      "Move the scene to a different location. Optionally specify NPC names to move with the player. " +
      "The player character always moves. Call this when the narrative describes travel to a new place.",
    inputSchema: jsonSchema<MoveToLocationInput>({
      type: "object",
      properties: {
        locationName: {
          type: "string",
          description: "Name of the destination location",
        },
        entityNames: {
          type: "array",
          items: { type: "string" },
          description: "Names of NPCs moving with the player (optional)",
        },
      },
      required: ["locationName"],
      additionalProperties: false,
    }),
    execute: async ({ locationName, entityNames }: MoveToLocationInput) => {
      const targetLoc = structured.locations.find(
        (l) => l.name.toLowerCase() === locationName.toLowerCase(),
      );
      if (!targetLoc) {
        return {
          success: false,
          message: `Location "${locationName}" not found.`,
        };
      }

      // Capture previous presence for delta reporting
      const previousPresent = new Set(structured.scene.presentEntityIds);

      // Mutate scene
      structured.scene = {
        ...structured.scene,
        location: targetLoc.name,
        locationId: targetLoc.id,
      };
      if (targetLoc.atmosphere) {
        structured.scene.atmosphere = targetLoc.atmosphere;
      }

      // Move player character
      const player = structured.entities.find((e) => e.isPlayerCharacter);
      if (player) {
        player.locationId = targetLoc.id;
      }

      // Move specified NPCs
      const movedNames: string[] = [];
      if (entityNames) {
        for (const name of entityNames) {
          const entity = structured.entities.find(
            (e) =>
              !e.isPlayerCharacter &&
              e.name.toLowerCase() === name.toLowerCase(),
          );
          if (entity) {
            entity.locationId = targetLoc.id;
            movedNames.push(entity.name);
          }
        }
      }

      // Rebuild presentEntityIds from entities at the new location
      const presentIds = structured.entities
        .filter((e) => e.locationId === targetLoc.id)
        .map((e) => e.id);
      structured.scene.presentEntityIds = presentIds;

      const presentSet = new Set(presentIds);
      const nowPresent = presentIds
        .filter((id) => !previousPresent.has(id))
        .map((id) => resolveEntityName(structured.entities, id));
      const departed = [...previousPresent]
        .filter((id) => !presentSet.has(id))
        .map((id) => resolveEntityName(structured.entities, id));

      return {
        success: true,
        location: targetLoc.name,
        atmosphere: targetLoc.atmosphere || null,
        movedEntities: movedNames,
        nowPresent,
        departed,
      };
    },
  });
}
