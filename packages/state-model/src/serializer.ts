import { resolveEntityName } from "./entities.js";
import type {
  AppearanceEntry,
  DemeanorEntry,
  Entity,
  Relationship,
  SceneInfo,
  StructuredStoryState,
} from "./types.js";

function serializeEntities(entities: Entity[]): string {
  return entities
    .map((entity) => {
      const tag = entity.isPlayerCharacter ? " [player character]" : "";
      return `- **${entity.name}** — ${entity.description}${tag}`;
    })
    .join("\n");
}

function serializeRelationships(
  relationships: Relationship[],
  entities: Entity[],
): string {
  return relationships
    .map((relationship) => {
      const from = resolveEntityName(entities, relationship.fromEntityId);
      const to = resolveEntityName(entities, relationship.toEntityId);
      let line = `- **${from} → ${to}**: ${relationship.description}`;
      if (relationship.details.length > 0) {
        line += `\n${relationship.details.map((detail) => `  - ${detail}`).join("\n")}`;
      }
      return line;
    })
    .join("\n");
}

function serializeCharacters(
  entries: AppearanceEntry[],
  entities: Entity[],
): string {
  const grouped = new Map<string, AppearanceEntry[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.entityId) ?? [];
    group.push(entry);
    grouped.set(entry.entityId, group);
  }

  const blocks: string[] = [];
  for (const [entityId, items] of grouped) {
    const name = resolveEntityName(entities, entityId);
    const lines = items.map(
      (entry) => `- **${entry.attribute}**: ${entry.description}`,
    );
    blocks.push(`### ${name}\n\n#### Appearance\n\n${lines.join("\n")}`);
  }

  return blocks.join("\n\n");
}

function serializeScene(scene: SceneInfo, entities: Entity[]): string {
  const lines: string[] = [
    `- **Where/When**: ${scene.location || "[to be filled during play]"}`,
  ];
  const present = scene.presentEntityIds.map((id) =>
    resolveEntityName(entities, id),
  );
  lines.push(
    `- **Who is present**: ${present.length > 0 ? present.join(", ") : "[to be filled during play]"}`,
  );
  if (scene.atmosphere) {
    lines.push(`- **Atmosphere**: ${scene.atmosphere}`);
  }
  return lines.join("\n");
}

function serializeDemeanor(
  entries: DemeanorEntry[],
  entities: Entity[],
): string {
  const lines: string[] = [];
  for (const entry of entries) {
    const name = resolveEntityName(entities, entry.entityId);
    if (entry.mood) {
      lines.push(`- **${name ? `${name}'s mood` : "Mood"}**: ${entry.mood}`);
    }
  }

  const energy = entries.find((entry) => entry.energy)?.energy;
  if (energy) {
    lines.push(`- **Energy between them**: ${energy}`);
  }
  return lines.join("\n");
}

function serializeBulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function toDateStr(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10);
}

function byCreatedAt(left?: string, right?: string): number {
  return (left ?? "").localeCompare(right ?? "");
}

function serializeTimestampedList(
  items: { text: string; createdAt?: string }[],
): string {
  const sorted = [...items].sort((left, right) =>
    byCreatedAt(left.createdAt, right.createdAt),
  );
  return sorted
    .map((item) => `- ${item.text} (added: ${toDateStr(item.createdAt)})`)
    .join("\n");
}

export function structuredToMarkdown(state: StructuredStoryState): string {
  const { entities } = state;
  const sections: string[] = [];

  if (entities.length > 0) {
    sections.push(`## Cast\n\n${serializeEntities(entities)}`);
  }
  if (state.relationships.length > 0) {
    sections.push(
      `## Relationships\n\n${serializeRelationships(state.relationships, entities)}`,
    );
  }
  if (state.appearance.length > 0) {
    sections.push(
      `## Characters\n\n${serializeCharacters(state.appearance, entities)}`,
    );
  }
  sections.push(`## Scene\n\n${serializeScene(state.scene, entities)}`);
  if (state.demeanor.length > 0) {
    sections.push(
      `## Current Demeanor\n\n${serializeDemeanor(state.demeanor, entities)}`,
    );
  }
  if (state.openThreads.length > 0) {
    const threadItems = state.openThreads
      .filter(
        (thread) => thread.status === "active" || thread.status === "evolved",
      )
      .map((thread) => ({
        text: thread.resolutionHint
          ? `${thread.description} (resolves when: ${thread.resolutionHint})`
          : thread.description,
        createdAt: thread.createdAt,
      }));
    if (threadItems.length > 0) {
      sections.push(
        `## Open Threads\n\n${serializeTimestampedList(threadItems)}`,
      );
    }
  }
  if (state.hardFacts.length > 0) {
    const factItems = state.hardFacts
      .filter((fact) => !fact.superseded)
      .map((fact) => ({
        text: fact.fact,
        createdAt: fact.establishedAt ?? fact.createdAt,
      }));
    if (factItems.length > 0) {
      sections.push(
        `## Hard Facts (do not contradict these)\n\n${serializeTimestampedList(factItems)}`,
      );
    }
  }
  if (state.style.length > 0) {
    sections.push(`## Style\n\n${serializeBulletList(state.style)}`);
  }
  for (const section of state.custom) {
    sections.push(`## ${section.heading}\n\n${section.content}`);
  }

  return sections.join("\n\n");
}
