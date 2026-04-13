import { jsonSchema, tool } from "ai";
import {
  findEntityByName,
  parseMarkdownToStructured,
  resolveEntityName,
} from "@chatterbox/state-model";
import { retrieveSimilarPairs } from "@/lib/message-embeddings";

import {
  buildStoryContextFacts,
  buildStoryContextRelationships,
  buildStoryContextThreads,
  clampPositiveInt,
  compactText,
} from "./chat-tools";

export type FactsInput = {
  maxFacts?: number;
  factTags?: Array<
    "biographical" | "spatial" | "relational" | "temporal" | "world" | "event"
  >;
  includeDetails?: boolean;
};

export function createFactsTool(
  structured: ReturnType<typeof parseMarkdownToStructured>,
) {
  return tool({
    description:
      "Retrieve hard facts from story state. Use factTags to filter by category.",
    inputSchema: jsonSchema<FactsInput>({
      type: "object",
      properties: {
        maxFacts: { type: "number" },
        factTags: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "biographical",
              "spatial",
              "relational",
              "temporal",
              "world",
              "event",
            ],
          },
        },
        includeDetails: { type: "boolean" },
      },
      additionalProperties: false,
    }),
    execute: async ({
      maxFacts,
      factTags,
      includeDetails = false,
    }: FactsInput) => {
      const activeFacts = structured.hardFacts.filter(
        (fact) => !fact.superseded,
      );
      return {
        facts: buildStoryContextFacts(
          activeFacts,
          true,
          includeDetails,
          maxFacts,
          factTags,
        ),
      };
    },
  });
}

export type RelationshipsInput = {
  maxRelationships?: number;
  includeDetails?: boolean;
  fromName?: string;
  toName?: string;
};

export function createRelationshipsTool(
  structured: ReturnType<typeof parseMarkdownToStructured>,
) {
  return tool({
    description:
      "Retrieve character relationships from story state. Optionally filter by character name.",
    inputSchema: jsonSchema<RelationshipsInput>({
      type: "object",
      properties: {
        maxRelationships: { type: "number" },
        includeDetails: { type: "boolean" },
        fromName: { type: "string" },
        toName: { type: "string" },
      },
      additionalProperties: false,
    }),
    execute: async ({
      maxRelationships,
      includeDetails = false,
      fromName,
      toName,
    }: RelationshipsInput) => {
      let source = structured;
      if (fromName || toName) {
        const normalize = (v: string) => v.trim().toLowerCase();
        const from = fromName ? normalize(fromName) : null;
        const to = toName ? normalize(toName) : null;
        const filteredRelationships = structured.relationships.filter((r) => {
          const resolvedFrom = resolveEntityName(
            structured.entities,
            r.fromEntityId,
          ).toLowerCase();
          const resolvedTo = resolveEntityName(
            structured.entities,
            r.toEntityId,
          ).toLowerCase();
          if (from && to) {
            return (
              (resolvedFrom === from && resolvedTo === to) ||
              (resolvedFrom === to && resolvedTo === from)
            );
          }
          if (from) return resolvedFrom === from || resolvedTo === from;
          return resolvedFrom === to || resolvedTo === to;
        });
        source = { ...structured, relationships: filteredRelationships };
      }
      return {
        relationships: buildStoryContextRelationships(
          source,
          true,
          includeDetails,
          maxRelationships,
        ),
      };
    },
  });
}

export type ThreadsInput = {
  maxThreads?: number;
  includeDetails?: boolean;
};

export function createThreadsTool(
  structured: ReturnType<typeof parseMarkdownToStructured>,
) {
  return tool({
    description: "Retrieve open story threads from story state.",
    inputSchema: jsonSchema<ThreadsInput>({
      type: "object",
      properties: {
        maxThreads: { type: "number" },
        includeDetails: { type: "boolean" },
      },
      additionalProperties: false,
    }),
    execute: async ({ maxThreads, includeDetails = false }: ThreadsInput) => ({
      threads: buildStoryContextThreads(
        structured,
        true,
        includeDetails,
        maxThreads,
      ),
    }),
  });
}

export type SceneContextInput = {
  includeDetails?: boolean;
};

export function createSceneContextTool(
  structured: ReturnType<typeof parseMarkdownToStructured>,
) {
  return tool({
    description:
      "Retrieve current scene context: location, present characters, atmosphere, and active thread summary.",
    inputSchema: jsonSchema<SceneContextInput>({
      type: "object",
      properties: {
        includeDetails: { type: "boolean" },
      },
      additionalProperties: false,
    }),
    execute: async ({ includeDetails = false }: SceneContextInput) => {
      const presentNames = structured.scene.presentEntityIds.map((id) =>
        resolveEntityName(structured.entities, id),
      );
      const activeThread = structured.openThreads.find(
        (t) => t.status === "active",
      );
      const sceneLoc = structured.locations.find(
        (l) => l.id === structured.scene.locationId,
      );
      return {
        location: structured.scene.location || null,
        locationId: structured.scene.locationId ?? null,
        atmosphere: structured.scene.atmosphere || null,
        presentCharacters: presentNames,
        activeThread: activeThread
          ? {
              hook: compactText(
                activeThread.hook ?? activeThread.description,
                90,
              ),
              description: includeDetails
                ? activeThread.description
                : compactText(activeThread.description, 280),
            }
          : null,
        connections: sceneLoc
          ? sceneLoc.connectedTo.map((c) => ({
              name: c.locationName,
              traversalHint: c.traversalHint || null,
            }))
          : [],
      };
    },
  });
}

export type LookupEntityInput = {
  name: string;
};

export function createLookupEntityTool(
  structured: ReturnType<typeof parseMarkdownToStructured>,
) {
  return tool({
    description:
      "Look up a character by name in the entity registry. Returns entity details and which sections reference them.",
    inputSchema: jsonSchema<LookupEntityInput>({
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    }),
    execute: async ({ name }: LookupEntityInput) => {
      const entity = findEntityByName(structured.entities, name);
      if (!entity) return { found: false, name };
      const relatedRelationships = structured.relationships
        .filter(
          (r) => r.fromEntityId === entity.id || r.toEntityId === entity.id,
        )
        .map((r) => ({
          from: resolveEntityName(structured.entities, r.fromEntityId),
          to: resolveEntityName(structured.entities, r.toEntityId),
          tone: r.tone ?? "neutral",
        }));
      const relatedAppearance = structured.appearance
        .filter((a) => a.entityId === entity.id)
        .map((a) => ({
          attribute: a.attribute,
          category: a.category ?? null,
        }));
      const relatedDemeanor = structured.demeanor
        .filter((d) => d.entityId === entity.id)
        .map((d) => ({
          mood: d.mood,
          energy: d.energy,
        }));
      return {
        found: true,
        entity: {
          name: entity.name,
          description: entity.description,
          isPlayerCharacter: entity.isPlayerCharacter,
        },
        relationships: relatedRelationships,
        appearance: relatedAppearance,
        demeanor: relatedDemeanor,
      };
    },
  });
}

export type SearchHistoryInput = {
  query: string;
  maxResults?: number;
};

export function createSearchHistoryTool(
  conversationId: string | null | undefined,
) {
  return tool({
    description:
      "Search past conversation turns by semantic similarity. Returns matching message pairs.",
    inputSchema: jsonSchema<SearchHistoryInput>({
      type: "object",
      properties: {
        query: { type: "string" },
        maxResults: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    }),
    execute: async ({ query, maxResults }: SearchHistoryInput) => {
      if (!conversationId || !query.trim()) return { results: [] };
      const limit = Math.min(clampPositiveInt(maxResults, 5), 10);
      try {
        const pairs = await retrieveSimilarPairs(conversationId, query, limit);
        return {
          results: pairs.map((p) => ({
            turnIndex: p.turnIndex,
            userText: compactText(p.userText, 300),
            assistantText: compactText(p.assistantText, 300),
          })),
        };
      } catch {
        return { results: [] };
      }
    },
  });
}

export type LocationDetailsInput = {
  locationName?: string;
};

export function createLocationDetailsTool(
  structured: ReturnType<typeof parseMarkdownToStructured>,
) {
  return tool({
    description:
      "Look up details for a specific location or the current location including connections, atmosphere, and who is there.",
    inputSchema: jsonSchema<LocationDetailsInput>({
      type: "object",
      properties: {
        locationName: { type: "string" },
      },
      additionalProperties: false,
    }),
    execute: async ({ locationName }: LocationDetailsInput) => {
      let loc;
      if (locationName) {
        loc = structured.locations.find(
          (l) => l.name.toLowerCase() === locationName.toLowerCase(),
        );
      } else {
        loc = structured.locations.find(
          (l) => l.id === structured.scene.locationId,
        );
      }
      if (!loc) {
        return {
          found: false,
          name: locationName ?? null,
          message: locationName
            ? `No location named "${locationName}" found.`
            : "No current location set.",
        };
      }
      const entitiesHere = structured.entities
        .filter((e) => e.locationId === loc.id)
        .map((e) => e.name);
      return {
        found: true,
        name: loc.name,
        description: loc.description || null,
        tags: loc.tags,
        atmosphere: loc.atmosphere || null,
        connectedLocations: loc.connectedTo.map((c) => ({
          name: c.locationName,
          description: c.description || null,
          hint: c.traversalHint || null,
        })),
        presentCharacters: entitiesHere,
      };
    },
  });
}

export function createNearbyLocationsTool(
  structured: ReturnType<typeof parseMarkdownToStructured>,
) {
  return tool({
    description: "List locations reachable from the current position.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => {
      const currentLoc = structured.locations.find(
        (l) => l.id === structured.scene.locationId,
      );
      if (!currentLoc) {
        return { available: false, reason: "No structured location set." };
      }
      return {
        available: true,
        currentLocation: currentLoc.name,
        nearby: currentLoc.connectedTo.map((c) => ({
          name: c.locationName,
          via: c.description || null,
          hint: c.traversalHint || null,
        })),
      };
    },
  });
}
