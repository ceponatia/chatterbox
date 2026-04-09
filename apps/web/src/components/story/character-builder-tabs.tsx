"use client";

import { useState } from "react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CHARACTER_TABS, type SectionDefinition } from "@/lib/character-schema";
import type {
  CharacterAppearanceEntry,
  StoryCharacterRecord,
} from "@/lib/story-project-types";
import { CharacterFormField } from "./character-form-field";
import type { CharacterBuilderDraft } from "./use-character-builder";

function getIdentityFieldValue(
  draft: CharacterBuilderDraft,
  key: string,
): string {
  switch (key) {
    case "name":
      return draft.name;
    case "role":
      return draft.role;
    case "roleTitle":
      return draft.identity.role;
    case "age":
      return draft.identity.age;
    case "pronouns":
      return draft.identity.pronouns;
    case "species":
      return draft.identity.species;
    default:
      return draft.identity.situation;
  }
}

function getIdentityFieldChange(
  fieldKey: string,
  onNameChange: (value: string) => void,
  onRoleChange: (value: string) => void,
  onIdentityFieldChange: (
    key: keyof CharacterBuilderDraft["identity"],
    value: string,
  ) => void,
) {
  if (fieldKey === "name") return onNameChange;
  if (fieldKey === "role") return onRoleChange;
  return (nextValue: string) => {
    const key =
      fieldKey === "roleTitle"
        ? "role"
        : (fieldKey as keyof CharacterBuilderDraft["identity"]);
    onIdentityFieldChange(key, nextValue);
  };
}

function IdentitySection({
  draft,
  section,
  onNameChange,
  onRoleChange,
  onBackgroundChange,
  onIdentityFieldChange,
}: {
  draft: CharacterBuilderDraft;
  section: (typeof CHARACTER_TABS)[number]["sections"][number];
  onNameChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
  onIdentityFieldChange: (
    key: keyof CharacterBuilderDraft["identity"],
    value: string,
  ) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {section.fields.map((field) => {
        if (field.key === "background") {
          return (
            <div key={field.key} className="md:col-span-2">
              <CharacterFormField
                field={field}
                value={draft.background}
                onChange={onBackgroundChange}
              />
            </div>
          );
        }

        return (
          <div
            key={field.key}
            className={field.type === "textarea" ? "md:col-span-2" : undefined}
          >
            <CharacterFormField
              field={field}
              value={getIdentityFieldValue(draft, field.key)}
              onChange={getIdentityFieldChange(
                field.key,
                onNameChange,
                onRoleChange,
                onIdentityFieldChange,
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

export function IdentityTab({
  draft,
  onNameChange,
  onRoleChange,
  onPlayerChange,
  onBackgroundChange,
  onIdentityFieldChange,
}: {
  draft: CharacterBuilderDraft;
  onNameChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onPlayerChange: (value: boolean) => void;
  onBackgroundChange: (value: string) => void;
  onIdentityFieldChange: (
    key: keyof CharacterBuilderDraft["identity"],
    value: string,
  ) => void;
}) {
  const tab = CHARACTER_TABS.find((entry) => entry.id === "identity");
  if (!tab) return null;

  return (
    <div className="app-story-stack">
      <div className="app-story-card app-story-stack">
        <div>
          <h2 className="text-sm font-semibold">Identity</h2>
          <p className="app-editor-summary">
            Core story role, in-world identity, and baseline context.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.isPlayer}
            onChange={(event) => onPlayerChange(event.target.checked)}
            className="h-4 w-4 rounded border-border bg-input"
          />
          <span>Player character</span>
          <span className="app-editor-summary">
            Only one player character can exist per story.
          </span>
        </label>
        {tab.sections.map((section) => (
          <IdentitySection
            key={section.id}
            draft={draft}
            section={section}
            onNameChange={onNameChange}
            onRoleChange={onRoleChange}
            onBackgroundChange={onBackgroundChange}
            onIdentityFieldChange={onIdentityFieldChange}
          />
        ))}
      </div>
    </div>
  );
}

export function AppearanceTab({
  draft,
  onAppearanceChange,
  onAddAttribute,
  onRemoveAttribute,
  onMutabilityChange,
}: {
  draft: CharacterBuilderDraft;
  onAppearanceChange: (
    index: number,
    key: "attribute" | "value",
    value: string,
  ) => void;
  onAddAttribute: () => void;
  onRemoveAttribute: (index: number) => void;
  onMutabilityChange: (
    index: number,
    tier: CharacterAppearanceEntry["mutabilityTier"],
  ) => void;
}) {
  const section = CHARACTER_TABS.find((entry) => entry.id === "appearance")
    ?.sections[0];
  const field = section?.fields[0];
  if (!section || !field) return null;

  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Appearance</h2>
        <p className="app-editor-summary">
          Add stable and mutable details the runtime can reuse in state and
          prompt generation.
        </p>
      </div>
      <CharacterFormField
        field={field}
        attributes={draft.appearance}
        onAttributeChange={onAppearanceChange}
        onAddAttribute={onAddAttribute}
        onRemoveAttribute={onRemoveAttribute}
        onMutabilityChange={onMutabilityChange}
      />
    </div>
  );
}

function BehaviorSection({
  section,
  value,
  onChange,
}: {
  section: SectionDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const field = section.fields[0];
  if (!field) return null;

  return (
    <CollapsiblePrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="app-editor-section">
        <CollapsiblePrimitive.Trigger asChild={true}>
          <button type="button" className="app-editor-section-trigger">
            {open ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 text-left text-sm font-medium">
              {section.label}
            </span>
            {section.optional && <Badge variant="outline">optional</Badge>}
          </button>
        </CollapsiblePrimitive.Trigger>
        <CollapsiblePrimitive.Content className="app-editor-section-body">
          <CharacterFormField field={field} value={value} onChange={onChange} />
        </CollapsiblePrimitive.Content>
      </div>
    </CollapsiblePrimitive.Root>
  );
}

export function BehaviorTab({
  draft,
  onBehaviorFieldChange,
}: {
  draft: CharacterBuilderDraft;
  onBehaviorFieldChange: (
    key: keyof CharacterBuilderDraft["behavioralProfile"],
    value: string,
  ) => void;
}) {
  const tab = CHARACTER_TABS.find((entry) => entry.id === "behavior");
  if (!tab) return null;

  const hiddenKeys = draft.isPlayer
    ? new Set(["speechPatterns", "vocabulary", "mannerisms", "withPlayer"])
    : new Set<string>();

  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Behavior</h2>
        <p className="app-editor-summary">
          Capture how this character sounds, moves, and misreads situations.
        </p>
      </div>
      <div className="app-story-stack">
        {tab.sections
          .filter((section) => !hiddenKeys.has(section.fields[0]?.key ?? ""))
          .map((section) => {
            const field = section.fields[0];
            if (!field) return null;
            return (
              <BehaviorSection
                key={section.id}
                section={section}
                value={
                  draft.behavioralProfile[
                    field.key as keyof CharacterBuilderDraft["behavioralProfile"]
                  ]
                }
                onChange={(value) =>
                  onBehaviorFieldChange(
                    field.key as keyof CharacterBuilderDraft["behavioralProfile"],
                    value,
                  )
                }
              />
            );
          })}
      </div>
    </div>
  );
}

export function DemeanorTab({
  draft,
  onChange,
}: {
  draft: CharacterBuilderDraft;
  onChange: (value: string) => void;
}) {
  const section = CHARACTER_TABS.find((entry) => entry.id === "demeanor")
    ?.sections[0];
  const field = section?.fields[0];
  if (!section || !field) return null;

  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Demeanor</h2>
        <p className="app-editor-summary">
          Use this for the initial emotional posture that should be true before
          the first scene beat.
        </p>
      </div>
      <CharacterFormField
        field={field}
        value={draft.startingDemeanor}
        onChange={onChange}
      />
    </div>
  );
}

export function SourceTab({
  character,
  draft,
}: {
  character: StoryCharacterRecord;
  draft: CharacterBuilderDraft;
}) {
  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Source</h2>
        <p className="app-editor-summary">
          Imported markdown is preserved as a source snapshot. Structured edits
          live beside it.
        </p>
      </div>
      <div className="app-story-meta">
        <span>Entity: {character.entityId}</span>
        <span>{draft.isPlayer ? "Player character" : "NPC"}</span>
        <span>Created {new Date(character.createdAt).toLocaleString()}</span>
        <span>Updated {new Date(character.updatedAt).toLocaleString()}</span>
      </div>
      <Textarea
        value={draft.importedMarkdown}
        readOnly={true}
        className="min-h-80 font-mono text-xs leading-relaxed"
        placeholder="No imported markdown source for this character."
      />
    </div>
  );
}
