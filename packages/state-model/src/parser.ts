import {
  emptySectionMeta,
  emptyStructuredState,
  type CustomSection,
  type Entity,
  type StructuredStoryState,
} from "./types.js";
import { findEntityByName, findOrCreateEntity } from "./entities.js";
import {
  deriveThreadHook,
  generateStoryItemId,
  inferAttributeCategory,
  inferFactTags,
  inferRelationshipTone,
  summarizeFact,
} from "./inference.js";
import { ensureLifecycleDefaults } from "./lifecycle.js";
import {
  emptyRawSections,
  parseRawSection,
  resolveSection,
  type RawSections,
} from "./parser-helpers.js";

const TEMPLATE_PLACEHOLDER_RE = /^\{\{\s*(user|char)\s*\}\}$/i;

function isTemplatePlaceholder(name: string): boolean {
  return TEMPLATE_PLACEHOLDER_RE.test(name);
}

function registerName(
  entities: Entity[],
  name: string,
  isPlayer = false,
): void {
  if (!isTemplatePlaceholder(name)) {
    findOrCreateEntity(entities, name, isPlayer);
  }
}

function buildEntityRegistry(raw: RawSections): Entity[] {
  const entities: Entity[] = [];

  for (const castEntry of raw.cast) {
    if (isTemplatePlaceholder(castEntry.name)) continue;
    findOrCreateEntity(entities, castEntry.name, castEntry.isPlayer);
    const entity = findEntityByName(entities, castEntry.name);
    if (entity) {
      entity.description = castEntry.description;
      entity.isPlayerCharacter = castEntry.isPlayer;
    }
  }

  for (const relationship of raw.relationships) {
    registerName(entities, relationship.from);
    registerName(entities, relationship.to);
  }
  for (const appearance of raw.appearance) {
    registerName(entities, appearance.character);
  }
  for (const demeanor of raw.demeanor) {
    if (demeanor.character) {
      registerName(entities, demeanor.character);
    }
  }
  for (const presentName of raw.scene.presentNames) {
    registerName(entities, presentName);
  }

  return entities;
}

function resolveEntityId(entities: Entity[], name: string): string {
  return (
    findEntityByName(entities, name)?.id ??
    findOrCreateEntity(entities, name).id
  );
}

function resolveRawToState(
  raw: RawSections,
  entities: Entity[],
  custom: CustomSection[],
): StructuredStoryState {
  return {
    entities,
    relationships: raw.relationships.map((relationship) => ({
      fromEntityId: resolveEntityId(entities, relationship.from),
      toEntityId: resolveEntityId(entities, relationship.to),
      description: relationship.description,
      details: relationship.details,
      tone: inferRelationshipTone(
        `${relationship.description}\n${relationship.details.join(" ")}`,
      ),
    })),
    appearance: raw.appearance.map((entry) => ({
      entityId: resolveEntityId(entities, entry.character),
      attribute: entry.attribute,
      description: entry.description,
      category: inferAttributeCategory(entry.attribute, entry.description),
    })),
    scene: {
      location: raw.scene.location,
      presentEntityIds: raw.scene.presentNames.map((name) =>
        resolveEntityId(entities, name),
      ),
      atmosphere: raw.scene.atmosphere,
    },
    demeanor: raw.demeanor.map((entry) => ({
      entityId: entry.character
        ? resolveEntityId(entities, entry.character)
        : (entities[0]?.id ?? ""),
      mood: entry.mood,
      energy: entry.energy,
    })),
    openThreads: raw.openThreads.map((entry) => ({
      id: generateStoryItemId("thread", entry.text),
      description: entry.text,
      hook: deriveThreadHook(entry.text),
      resolutionHint: entry.resolutionHint ?? "",
      lastReferencedAt: entry.createdAt,
      status: "active",
      evolvedInto: undefined,
      createdAt: entry.createdAt,
    })),
    hardFacts: raw.hardFacts.map((entry) => ({
      fact: entry.text,
      summary: summarizeFact(entry.text),
      tags: inferFactTags(entry.text),
      establishedAt: entry.createdAt,
      lastConfirmedAt: entry.createdAt,
      superseded: false,
      supersededBy: undefined,
      createdAt: entry.createdAt,
    })),
    style: raw.style,
    custom,
    sectionMeta: emptySectionMeta(),
  };
}

export function parseMarkdownToStructured(
  markdown: string,
): StructuredStoryState {
  if (!markdown.trim()) return emptyStructuredState();

  const parts = markdown.split(/^## /m);
  const raw = emptyRawSections();
  const customSections: CustomSection[] = [];

  for (let index = 1; index < parts.length; index++) {
    const part = parts[index]!;
    const newlineIndex = part.indexOf("\n");
    const heading =
      newlineIndex === -1 ? part.trim() : part.slice(0, newlineIndex).trim();
    const content =
      newlineIndex === -1 ? "" : part.slice(newlineIndex + 1).trim();

    const section = resolveSection(heading);
    if (!section) {
      customSections.push({ heading, content });
      continue;
    }

    parseRawSection(raw, section, content);
  }

  const entities = buildEntityRegistry(raw);
  return ensureLifecycleDefaults(
    resolveRawToState(raw, entities, customSections),
  );
}
