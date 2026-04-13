"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Lock, Unlock, Sparkles, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  SensoryProfile,
  SensoryAttributeNote,
} from "@/lib/sensory-schema";
import type { CharacterBuilderDraft } from "./use-character-builder";

const SENSORY_FIELDS = ["scent", "texture", "taste"] as const;
type SensoryField = (typeof SENSORY_FIELDS)[number];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SensoryTabProps {
  draft: CharacterBuilderDraft;
  storyId: string;
  characterId: string;
  onOverallChange: (field: string, value: string) => void;
  onOverallLockToggle: (field: string) => void;
  onAttributeChange: (attribute: string, field: string, value: string) => void;
  onAttributeLockToggle: (attribute: string, field: string) => void;
  onProfileUpdate: (profile: SensoryProfile) => void;
  onSyncAttributes: (appearanceAttributes: string[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCurrentAttrField(
  profile: SensoryProfile,
  attribute: string,
  field: SensoryField,
): string {
  const note = profile.attributes.find((n) => n.attribute === attribute);
  return note?.[field] ?? "";
}

function buildMergedProfile(
  current: SensoryProfile,
  inferred: SensoryProfile,
  accepted: Set<string>,
): SensoryProfile {
  const mergedOverall = { ...current.overall };
  for (const field of SENSORY_FIELDS) {
    if (accepted.has(`overall.${field}`)) {
      mergedOverall[field] = inferred.overall[field];
    }
  }

  const mergedAttributes: SensoryAttributeNote[] = current.attributes.map(
    (currentNote) => {
      const inferredNote = inferred.attributes.find(
        (n) => n.attribute === currentNote.attribute,
      );
      if (!inferredNote) return currentNote;

      const merged = { ...currentNote };
      for (const field of SENSORY_FIELDS) {
        if (accepted.has(`attr.${currentNote.attribute}.${field}`)) {
          merged[field] = inferredNote[field];
        }
      }
      return merged;
    },
  );

  return { overall: mergedOverall, attributes: mergedAttributes };
}

// ---------------------------------------------------------------------------
// SensoryFieldRow
// ---------------------------------------------------------------------------

function SensoryFieldRow({
  label,
  value,
  locked,
  onChange,
  onToggleLock,
}: {
  label: string;
  value: string;
  locked: boolean;
  onChange: (value: string) => void;
  onToggleLock: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <label className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Describe ${label.toLowerCase()}...`}
          className={cn("min-h-16 text-sm", locked && "opacity-60")}
          rows={2}
        />
      </div>
      <button
        type="button"
        onClick={onToggleLock}
        className="mt-5 p-1 text-muted-foreground hover:text-foreground"
        title={
          locked
            ? "Unlock (inference can update)"
            : "Lock (inference will skip)"
        }
      >
        {locked ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <Unlock className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OverallSection
// ---------------------------------------------------------------------------

function OverallSection({
  overall,
  onFieldChange,
  onLockToggle,
}: {
  overall: SensoryProfile["overall"];
  onFieldChange: (field: string, value: string) => void;
  onLockToggle: (field: string) => void;
}) {
  const locked = overall.lockedFields ?? [];

  return (
    <>
      {SENSORY_FIELDS.map((field) => (
        <SensoryFieldRow
          key={field}
          label={field.charAt(0).toUpperCase() + field.slice(1)}
          value={overall[field] ?? ""}
          locked={locked.includes(field)}
          onChange={(value) => onFieldChange(field, value)}
          onToggleLock={() => onLockToggle(field)}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// AttributeSection
// ---------------------------------------------------------------------------

function AttributeSection({
  attributes,
  onFieldChange,
  onLockToggle,
}: {
  attributes: SensoryAttributeNote[];
  onFieldChange: (attribute: string, field: string, value: string) => void;
  onLockToggle: (attribute: string, field: string) => void;
}) {
  const visible = attributes.filter(
    (note) => note.attribute.toLowerCase() !== "voice",
  );

  if (visible.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No appearance attributes yet. Fill out the Appearance tab first to
        enable per-attribute sensory notes.
      </p>
    );
  }

  return (
    <>
      {visible.map((note) => {
        const locked = note.lockedFields ?? [];
        return (
          <div key={note.attribute} className="app-editor-card gap-2">
            <span className="text-xs font-semibold">{note.attribute}</span>
            {SENSORY_FIELDS.map((field) => (
              <SensoryFieldRow
                key={field}
                label={field.charAt(0).toUpperCase() + field.slice(1)}
                value={note[field] ?? ""}
                locked={locked.includes(field)}
                onChange={(value) =>
                  onFieldChange(note.attribute, field, value)
                }
                onToggleLock={() => onLockToggle(note.attribute, field)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// InferencePreview
// ---------------------------------------------------------------------------

interface InferencePreviewProps {
  current: SensoryProfile;
  inferred: SensoryProfile;
  onAccept: (profile: SensoryProfile) => void;
  onCancel: () => void;
}

function InferencePreview({
  current,
  inferred,
  onAccept,
  onCancel,
}: InferencePreviewProps) {
  const [accepted, setAccepted] = useState<Set<string>>(() => {
    const keys = new Set<string>();
    for (const field of SENSORY_FIELDS) {
      if (
        inferred.overall[field] &&
        inferred.overall[field] !== (current.overall[field] ?? "")
      ) {
        keys.add(`overall.${field}`);
      }
    }
    for (const note of inferred.attributes) {
      for (const field of SENSORY_FIELDS) {
        const currentVal = findCurrentAttrField(current, note.attribute, field);
        if (note[field] && note[field] !== currentVal) {
          keys.add(`attr.${note.attribute}.${field}`);
        }
      }
    }
    return keys;
  });

  function toggleField(key: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleApply() {
    const merged = buildMergedProfile(current, inferred, accepted);
    onAccept(merged);
  }

  const overallChanges: { key: string; label: string; value: string }[] = [];
  for (const field of SENSORY_FIELDS) {
    const key = `overall.${field}`;
    const inferredVal = inferred.overall[field] ?? "";
    const currentVal = current.overall[field] ?? "";
    if (inferredVal && inferredVal !== currentVal) {
      overallChanges.push({
        key,
        label: `Overall ${field}`,
        value: inferredVal,
      });
    }
  }

  const attrChanges: {
    key: string;
    label: string;
    value: string;
  }[] = [];
  for (const note of inferred.attributes) {
    for (const field of SENSORY_FIELDS) {
      const key = `attr.${note.attribute}.${field}`;
      const inferredVal = note[field] ?? "";
      const currentVal = findCurrentAttrField(current, note.attribute, field);
      if (inferredVal && inferredVal !== currentVal) {
        attrChanges.push({
          key,
          label: `${note.attribute} ${field}`,
          value: inferredVal,
        });
      }
    }
  }

  const allChanges = [...overallChanges, ...attrChanges];

  if (allChanges.length === 0) {
    return (
      <div className="app-editor-card rounded-md border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Inference returned no changes.
        </p>
        <Button size="sm" variant="outline" onClick={onCancel} className="mt-2">
          Dismiss
        </Button>
      </div>
    );
  }

  return (
    <div className="app-editor-card rounded-md border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Inference Results</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>
            Dismiss
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={accepted.size === 0}
          >
            Apply Selected ({accepted.size})
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {allChanges.map(({ key, label, value }) => {
          const isAccepted = accepted.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleField(key)}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                isAccepted
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-muted/20 opacity-60",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {isAccepted ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {label}
                </span>
                <p className="mt-0.5 text-sm leading-snug">{value}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SensoryTab (main export)
// ---------------------------------------------------------------------------

export function SensoryTab({
  draft,
  storyId,
  characterId,
  onOverallChange,
  onOverallLockToggle,
  onAttributeChange,
  onAttributeLockToggle,
  onProfileUpdate,
  onSyncAttributes,
}: SensoryTabProps) {
  const [inferring, setInferring] = useState(false);
  const [inferenceResult, setInferenceResult] = useState<SensoryProfile | null>(
    null,
  );
  const [inferenceError, setInferenceError] = useState<string | null>(null);

  // Sync attributes with appearance list on mount and when appearance changes
  useEffect(() => {
    const attrs = draft.appearance
      .map((entry) => entry.attribute)
      .filter((attr) => attr.trim().length > 0);
    onSyncAttributes(attrs);
  }, [draft.appearance]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInfer = useCallback(async () => {
    setInferring(true);
    setInferenceError(null);
    setInferenceResult(null);
    try {
      const overall = draft.sensoryProfile.overall;
      const lockedOverallFields = overall.lockedFields ?? [];
      const lockedAttributeFields: Record<string, string[]> = {};
      for (const note of draft.sensoryProfile.attributes) {
        if (note.lockedFields?.length) {
          lockedAttributeFields[note.attribute] = note.lockedFields;
        }
      }

      const response = await fetch(
        `/api/story-projects/${storyId}/characters/${characterId}/infer-sensory`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lockedOverallFields,
            lockedAttributeFields,
            currentProfile: draft.sensoryProfile,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({}) as Record<string, unknown>);
        throw new Error(
          (errorData as { error?: string }).error ??
            `Inference failed (${response.status})`,
        );
      }

      const result = (await response.json()) as SensoryProfile;
      setInferenceResult(result);
    } catch (error) {
      setInferenceError(
        error instanceof Error ? error.message : "Inference failed",
      );
    } finally {
      setInferring(false);
    }
  }, [storyId, characterId, draft.sensoryProfile]);

  const allLocked = useMemo(() => {
    const overallLocked = draft.sensoryProfile.overall.lockedFields ?? [];
    const allOverallLocked = SENSORY_FIELDS.every((f) =>
      overallLocked.includes(f),
    );
    const allAttrLocked = draft.sensoryProfile.attributes.every((note) => {
      const locked = note.lockedFields ?? [];
      return SENSORY_FIELDS.every((f) => locked.includes(f));
    });
    return allOverallLocked && allAttrLocked;
  }, [draft.sensoryProfile]);

  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Sensory Profile</h2>
        <p className="app-editor-summary">
          How does this character smell, feel, and taste? Fill in manually or
          use inference to generate vivid details from the character sheet.
        </p>
      </div>

      {/* Inference button */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => void handleInfer()}
          disabled={inferring || allLocked}
          title={allLocked ? "All fields are locked" : undefined}
        >
          {inferring ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          {inferring ? "Inferring..." : "Infer Sensory Details"}
        </Button>
        {inferenceError && (
          <span className="text-xs text-destructive">{inferenceError}</span>
        )}
      </div>

      {/* Inference preview overlay */}
      {inferenceResult && (
        <InferencePreview
          current={draft.sensoryProfile}
          inferred={inferenceResult}
          onAccept={(profile) => {
            onProfileUpdate(profile);
            setInferenceResult(null);
          }}
          onCancel={() => setInferenceResult(null)}
        />
      )}

      {/* Overall section */}
      <div className="app-editor-section">
        <div className="py-1">
          <span className="text-sm font-medium">Overall</span>
        </div>
        <div className="app-editor-section-body app-story-stack">
          <OverallSection
            overall={draft.sensoryProfile.overall}
            onFieldChange={onOverallChange}
            onLockToggle={onOverallLockToggle}
          />
        </div>
      </div>

      {/* Per-attribute section */}
      <div className="app-editor-section">
        <div className="py-1">
          <span className="text-sm font-medium">Per-Attribute Details</span>
        </div>
        <div className="app-editor-section-body app-story-stack">
          <AttributeSection
            attributes={draft.sensoryProfile.attributes}
            onFieldChange={onAttributeChange}
            onLockToggle={onAttributeLockToggle}
          />
        </div>
      </div>
    </div>
  );
}
