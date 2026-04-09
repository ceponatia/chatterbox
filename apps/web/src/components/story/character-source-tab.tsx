"use client";

import { useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { StoryReadonlyBlock } from "@/components/story/story-readonly-block";
import { Button } from "@/components/ui/button";
import type { ParsedCharacterMarkdown } from "@/lib/character-markdown-parser";
import type { CharacterProvenance } from "@/lib/story-project-types";
import { ImportPreviewModal } from "./character-import-preview";
import type { CharacterBuilderDraft } from "./use-character-builder";

const SECTION_LABELS: Record<keyof CharacterProvenance, string> = {
  identity: "Identity",
  background: "Background",
  appearance: "Appearance",
  behavioralProfile: "Behavioral Profile",
  startingDemeanor: "Starting Demeanor",
};

function sectionList(
  provenance: CharacterProvenance | null,
  target: "imported" | "form",
): string[] {
  if (!provenance) return [];

  return (
    Object.entries(SECTION_LABELS) as Array<[keyof CharacterProvenance, string]>
  )
    .filter(([key]) => provenance[key] === target)
    .map(([, label]) => label);
}

function getAuthoringMode(
  importedMarkdown: string | null,
  provenance: CharacterProvenance | null,
): "imported" | "form" | "hybrid" {
  const importedSections = sectionList(provenance, "imported");
  const formSections = sectionList(provenance, "form");

  if (importedSections.length > 0 && formSections.length > 0) return "hybrid";
  if (formSections.length > 0)
    return importedMarkdown?.trim() ? "hybrid" : "form";
  if (importedMarkdown?.trim() || importedSections.length > 0)
    return "imported";
  return "form";
}

export function CharacterSourceTab({
  importedMarkdown,
  provenance,
  existingDraft,
  onPreviewParse,
  onApplyParse,
  busy,
}: {
  importedMarkdown: string | null;
  provenance: CharacterProvenance | null;
  existingDraft: CharacterBuilderDraft | null;
  onPreviewParse: () => ParsedCharacterMarkdown | null;
  onApplyParse: (
    parsed: ParsedCharacterMarkdown,
    selectedSections: Set<string>,
  ) => void;
  busy: boolean;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] =
    useState<ParsedCharacterMarkdown | null>(null);
  const importedSections = sectionList(provenance, "imported");
  const formSections = sectionList(provenance, "form");
  const authoringMode = getAuthoringMode(importedMarkdown, provenance);

  function handlePreviewParse() {
    setError(null);
    setStatus(null);
    try {
      const parsed = onPreviewParse();
      if (!parsed) {
        setError("No imported markdown to parse.");
        return;
      }
      setPreviewData(parsed);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Parse failed.",
      );
    }
  }

  function handleAcceptPreview(selectedSections: Set<string>) {
    if (!previewData) return;
    onApplyParse(previewData, selectedSections);
    setPreviewData(null);
    setStatus("Applied selected sections from import.");
  }

  return (
    <div className="app-story-card app-story-stack">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Source</h2>
          <p className="app-editor-summary">
            Track whether each structured section came from the import or the
            form.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !importedMarkdown?.trim()}
          onClick={handlePreviewParse}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Parse from Import
        </Button>
      </div>

      <div className="app-story-meta">
        <span>Authoring mode: {authoringMode}</span>
        <span>Imported sections: {importedSections.length}</span>
        <span>Form sections: {formSections.length}</span>
      </div>

      {importedSections.length > 0 && (
        <div className="app-editor-card text-xs text-muted-foreground">
          <strong className="text-foreground">Imported:</strong>{" "}
          {importedSections.join(", ")}
        </div>
      )}

      {formSections.length > 0 && (
        <div className="app-editor-card text-xs text-muted-foreground">
          <strong className="text-foreground">Form:</strong>{" "}
          {formSections.join(", ")}
        </div>
      )}

      {status && <div className="app-editor-summary text-xs">{status}</div>}
      {error && <div className="app-editor-warning text-xs">{error}</div>}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-4 w-4" />
        Raw imported markdown
      </div>

      <StoryReadonlyBlock
        label="Imported character markdown"
        value={importedMarkdown}
        placeholder="No imported character markdown yet."
      />

      {previewData && existingDraft && (
        <ImportPreviewModal
          open={previewData !== null}
          onOpenChange={(open) => {
            if (!open) setPreviewData(null);
          }}
          parsed={previewData}
          existingDraft={existingDraft}
          onAccept={handleAcceptPreview}
        />
      )}
    </div>
  );
}
