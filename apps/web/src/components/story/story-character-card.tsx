"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import type { StoryCharacterRecord } from "@/lib/story-project-types";

function countAppearanceAttributes(character: StoryCharacterRecord): number {
  return (character.appearance ?? []).filter(
    (entry) =>
      entry.attribute.trim().length > 0 && entry.value.trim().length > 0,
  ).length;
}

function behaviorSummary(character: StoryCharacterRecord): string {
  const profile = character.behavioralProfile;
  if (!profile) return "Behavior: none";

  const visibleFields = [
    profile.overview,
    character.isPlayer ? "" : profile.speechPatterns,
    character.isPlayer ? "" : profile.vocabulary,
    profile.emotionalTexture,
    character.isPlayer ? "" : profile.withPlayer,
    profile.commonMistakes,
    character.isPlayer ? "" : profile.mannerisms,
  ];
  const filledCount = visibleFields.filter(
    (value) => value.trim().length > 0,
  ).length;
  if (filledCount === 0) return "Behavior: none";
  if (filledCount === visibleFields.filter(Boolean).length)
    return "Behavior: full";
  return "Behavior: partial";
}

function demeanorSummary(character: StoryCharacterRecord): string {
  return character.startingDemeanor?.trim() ? "Demeanor: set" : "No demeanor";
}

function completenessSummary(character: StoryCharacterRecord): string {
  return [
    `${countAppearanceAttributes(character)} appearance attributes`,
    behaviorSummary(character),
    demeanorSummary(character),
  ].join(" | ");
}

function computeCompleteness(character: StoryCharacterRecord): {
  missingFields: string[];
  isComplete: boolean;
} {
  const missing: string[] = [];
  if (!character.behavioralProfile?.overview?.trim()) {
    missing.push("No overview");
  }
  if (countAppearanceAttributes(character) === 0) {
    missing.push("No appearance");
  }
  if (!character.startingDemeanor?.trim()) {
    missing.push("No demeanor");
  }
  return { missingFields: missing, isComplete: missing.length === 0 };
}

export function StoryCharacterSummaryCard({
  storyId,
  character,
  busy,
  onDelete,
}: {
  storyId: string;
  character: StoryCharacterRecord;
  busy: boolean;
  onDelete: () => Promise<void>;
}) {
  const { missingFields, isComplete } = computeCompleteness(character);

  return (
    <div className="app-story-card transition-colors hover:bg-accent/10">
      <div className="flex items-start gap-3">
        <Link
          href={`/stories/${storyId}/characters/${character.id}`}
          className="flex flex-1 flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{character.name}</h3>
            <Badge variant="outline">{character.role}</Badge>
            {character.isPlayer && <Badge>player</Badge>}
            {isComplete ? (
              <Badge
                variant="outline"
                className="border-green-600 text-green-500"
              >
                Complete
              </Badge>
            ) : (
              missingFields.map((label) => (
                <Badge
                  key={label}
                  variant="outline"
                  className="border-yellow-600 text-yellow-500"
                >
                  {label}
                </Badge>
              ))
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {completenessSummary(character)}
          </p>
          <div className="app-story-meta">
            <span>Entity: {character.entityId}</span>
            <span>
              {character.importedMarkdown?.trim()
                ? "Imported source available"
                : "No imported source"}
            </span>
          </div>
        </Link>
        <ConfirmDeleteButton
          onConfirm={() => void onDelete()}
          className={busy ? "pointer-events-none opacity-50" : undefined}
        />
      </div>
    </div>
  );
}
