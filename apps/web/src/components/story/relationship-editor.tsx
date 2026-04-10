"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { RelationshipTone } from "@chatterbox/state-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateStoryRelationships } from "@/lib/story-project-client";
import type {
  StoryCharacterRecord,
  StoryProjectRelationshipInput,
  StoryRelationshipRecord,
} from "@/lib/story-project-types";

const RELATIONSHIP_TONES: RelationshipTone[] = [
  "hostile",
  "cold",
  "neutral",
  "warm",
  "close",
  "intimate",
];

const TONE_COLORS: Record<RelationshipTone, string> = {
  hostile: "bg-red-900/40 text-red-300",
  cold: "bg-blue-900/40 text-blue-300",
  neutral: "bg-zinc-700/40 text-zinc-300",
  warm: "bg-amber-900/40 text-amber-300",
  close: "bg-green-900/40 text-green-300",
  intimate: "bg-purple-900/40 text-purple-300",
};

interface RelationshipEditorProps {
  storyId: string;
  relationships: StoryRelationshipRecord[];
  characters: StoryCharacterRecord[];
  onRelationshipsChange: (relationships: StoryRelationshipRecord[]) => void;
  refreshProject: () => Promise<unknown>;
}

interface DraftRelationship {
  fromEntityId: string;
  toEntityId: string;
  description: string;
  details: string[];
  tone: RelationshipTone | null;
}

const EMPTY_DRAFT: DraftRelationship = {
  fromEntityId: "",
  toEntityId: "",
  description: "",
  details: [],
  tone: null,
};

function entityName(
  characters: StoryCharacterRecord[],
  entityId: string,
): string {
  return (
    characters.find((c) => c.entityId === entityId)?.name ??
    entityId.slice(0, 8)
  );
}

function toInput(
  relationships: StoryRelationshipRecord[],
): StoryProjectRelationshipInput[] {
  return relationships.map((r) => ({
    fromEntityId: r.fromEntityId,
    toEntityId: r.toEntityId,
    description: r.description,
    details: r.details,
    tone: r.tone,
  }));
}

function CharacterSelect({
  characters,
  value,
  onChange,
  label,
}: {
  characters: StoryCharacterRecord[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {characters.map((c) => (
          <SelectItem key={c.entityId} value={c.entityId}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToneSelect({
  value,
  onChange,
}: {
  value: RelationshipTone | null;
  onChange: (value: RelationshipTone | null) => void;
}) {
  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) =>
        onChange(v === "none" ? null : (v as RelationshipTone))
      }
    >
      <SelectTrigger className="h-8 w-32 text-xs">
        <SelectValue placeholder="Tone" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No tone</SelectItem>
        {RELATIONSHIP_TONES.map((tone) => (
          <SelectItem key={tone} value={tone}>
            {tone}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DetailsEditor({
  details,
  onChange,
}: {
  details: string[];
  onChange: (details: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {details.map((detail, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            value={detail}
            onChange={(event) => {
              const next = [...details];
              next[index] = event.target.value;
              onChange(next);
            }}
            placeholder="Detail"
            className="flex-1 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={() => onChange(details.filter((_, i) => i !== index))}
            title="Remove detail"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit gap-1 text-xs"
        onClick={() => onChange([...details, ""])}
      >
        <Plus className="h-3 w-3" />
        Add detail
      </Button>
    </div>
  );
}

function RelationshipCard({
  relationship,
  characters,
  onUpdate,
  onDelete,
}: {
  relationship: StoryRelationshipRecord;
  characters: StoryCharacterRecord[];
  onUpdate: (patch: Partial<StoryProjectRelationshipInput>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="app-editor-card flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium">
            {entityName(characters, relationship.fromEntityId)}
          </span>
          <span className="text-muted-foreground">&rarr;</span>
          <span className="font-medium">
            {entityName(characters, relationship.toEntityId)}
          </span>
          {relationship.tone && (
            <Badge
              variant="secondary"
              className={TONE_COLORS[relationship.tone]}
            >
              {relationship.tone}
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onClick={onDelete}
          title="Remove relationship"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CharacterSelect
          characters={characters}
          value={relationship.fromEntityId}
          onChange={(fromEntityId) => onUpdate({ fromEntityId })}
          label="From"
        />
        <CharacterSelect
          characters={characters}
          value={relationship.toEntityId}
          onChange={(toEntityId) => onUpdate({ toEntityId })}
          label="To"
        />
      </div>

      <Input
        value={relationship.description}
        onChange={(event) => onUpdate({ description: event.target.value })}
        placeholder="Relationship description"
        className="text-xs"
      />

      <ToneSelect
        value={relationship.tone}
        onChange={(tone) => onUpdate({ tone })}
      />

      <DetailsEditor
        details={relationship.details}
        onChange={(details) => onUpdate({ details })}
      />
    </div>
  );
}

export function RelationshipEditor({
  storyId,
  relationships,
  characters,
  onRelationshipsChange,
  refreshProject,
}: RelationshipEditorProps) {
  const [draft, setDraft] = useState<DraftRelationship | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextInputs: StoryProjectRelationshipInput[]) {
    setSaving(true);
    setError(null);
    try {
      const saved = await updateStoryRelationships(storyId, nextInputs);
      onRelationshipsChange(saved);
      await refreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleUpdate(
    index: number,
    patch: Partial<StoryProjectRelationshipInput>,
  ) {
    const next = [...relationships];
    const current = next[index];
    if (!current) return;
    next[index] = { ...current, ...patch } as StoryRelationshipRecord;
    onRelationshipsChange(next);
  }

  function handleDelete(index: number) {
    const next = relationships.filter((_, i) => i !== index);
    void save(toInput(next));
  }

  function handleAddDraft() {
    setDraft({ ...EMPTY_DRAFT });
  }

  function handleCommitDraft() {
    if (!draft || !draft.fromEntityId || !draft.toEntityId) return;
    const nextInputs: StoryProjectRelationshipInput[] = [
      ...toInput(relationships),
      {
        fromEntityId: draft.fromEntityId,
        toEntityId: draft.toEntityId,
        description: draft.description,
        details: draft.details.filter((d) => d.trim().length > 0),
        tone: draft.tone,
      },
    ];
    setDraft(null);
    void save(nextInputs);
  }

  function handleSaveAll() {
    void save(toInput(relationships));
  }

  return (
    <div className="app-story-card app-story-stack">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Relationships</h2>
        <div className="flex items-center gap-1.5">
          {relationships.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={saving}
              onClick={handleSaveAll}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={saving || draft !== null}
            onClick={handleAddDraft}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {error && <div className="app-editor-warning text-xs">{error}</div>}

      {characters.length < 2 && (
        <p className="text-xs text-muted-foreground">
          Add at least two characters to define relationships.
        </p>
      )}

      {relationships.length === 0 && !draft && characters.length >= 2 && (
        <p className="text-xs text-muted-foreground">
          No relationships defined.
        </p>
      )}

      {relationships.map((rel, index) => (
        <RelationshipCard
          key={rel.id}
          relationship={rel}
          characters={characters}
          onUpdate={(patch) => handleUpdate(index, patch)}
          onDelete={() => handleDelete(index)}
        />
      ))}

      {draft && (
        <div className="app-editor-card flex flex-col gap-2 border-dashed p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">New Relationship</span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={!draft.fromEntityId || !draft.toEntityId || saving}
                onClick={handleCommitDraft}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <CharacterSelect
              characters={characters}
              value={draft.fromEntityId}
              onChange={(fromEntityId) => setDraft({ ...draft, fromEntityId })}
              label="From character"
            />
            <CharacterSelect
              characters={characters}
              value={draft.toEntityId}
              onChange={(toEntityId) => setDraft({ ...draft, toEntityId })}
              label="To character"
            />
          </div>

          <Input
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
            placeholder="Relationship description"
            className="text-xs"
          />

          <ToneSelect
            value={draft.tone}
            onChange={(tone) => setDraft({ ...draft, tone })}
          />

          <DetailsEditor
            details={draft.details}
            onChange={(details) => setDraft({ ...draft, details })}
          />
        </div>
      )}
    </div>
  );
}
