"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileDown,
  Play,
  RefreshCw,
  Save,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StoryCharacterSummaryCard } from "@/components/story/story-character-card";
import { StoryReadonlyBlock } from "@/components/story/story-readonly-block";
import type { ImportReviewInput } from "@/components/story/import-review-modal";
import type { StoryProjectDetail } from "@/lib/story-project-types";

export function StoryLoadingState() {
  return (
    <div className="app-shell safe-top">
      <div className="app-chat-pane">
        <main className="app-story-main">
          <div className="app-empty-state-card self-center">
            Loading story...
          </div>
        </main>
      </div>
    </div>
  );
}

export function StoryMissingState() {
  return (
    <div className="app-shell safe-top">
      <div className="app-chat-pane">
        <main className="app-story-main">
          <div className="app-empty-state-card self-center">
            Story not found.
          </div>
        </main>
      </div>
    </div>
  );
}

export function StoryEditorHeader({
  project,
  busy,
  onSave,
  onGenerate,
  onLaunch,
}: {
  project: StoryProjectDetail;
  busy: boolean;
  onSave: () => void;
  onGenerate: () => void;
  onLaunch: () => void;
}) {
  return (
    <header className="app-panel-header h-14 px-3 lg:h-16 lg:px-4">
      <div className="flex items-center gap-3">
        <Button
          asChild={true}
          variant="ghost"
          size="sm"
          className="app-button-square"
        >
          <Link href="/stories" aria-label="Back to story library">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-base font-bold tracking-tight lg:text-lg">
            {project.name}
          </h1>
          <p className="app-editor-summary">
            Mode: {project.authoringMode} · {project.characters.length}{" "}
            characters
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild={true} variant="outline" size="sm">
          <Link href="/">Chat</Link>
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={onSave}>
          <Save className="mr-1 h-4 w-4" />
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={onGenerate}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Regenerate
        </Button>
        <Button size="sm" disabled={busy} onClick={onLaunch}>
          <Play className="mr-1 h-4 w-4" />
          Launch
        </Button>
      </div>
    </header>
  );
}

export function StoryMetadataCard({
  draftName,
  draftDescription,
  onNameChange,
  onDescriptionChange,
}: {
  draftName: string;
  draftDescription: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Metadata</h2>
        <p className="app-editor-summary">
          Save regenerates the current prompt and state cache.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        Name
        <Input
          value={draftName}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Description
        <Textarea
          value={draftDescription}
          onChange={(event) => onDescriptionChange(event.target.value)}
          className="min-h-24"
        />
      </label>
    </div>
  );
}

export function StoryCharactersCard({
  project,
  storyId,
  busy,
  onCreate,
  onDeleteCharacter,
}: {
  project: StoryProjectDetail;
  storyId: string;
  busy: boolean;
  onCreate: () => void;
  onDeleteCharacter: (characterId: string) => Promise<void>;
}) {
  return (
    <div className="app-story-card app-story-stack">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Characters</h2>
          <p className="app-editor-summary">
            Click a card to open the full character builder.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={onCreate}>
          Add Character
        </Button>
      </div>
      <div className="app-story-stack">
        {project.characters.length === 0 ? (
          <div className="app-editor-card text-xs text-muted-foreground">
            No characters yet. Add one here, then open it to fill in structured
            details.
          </div>
        ) : (
          project.characters.map((character) => (
            <StoryCharacterSummaryCard
              key={`${character.id}:${character.updatedAt}`}
              storyId={storyId}
              character={character}
              busy={busy}
              onDelete={() => onDeleteCharacter(character.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function StoryGeneratedOutputCard({
  project,
}: {
  project: StoryProjectDetail;
}) {
  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Generated Output</h2>
        <p className="app-editor-summary">
          This is the cached runtime snapshot used for preview and launch.
        </p>
      </div>
      <div className="app-story-meta">
        <span>{project.generatedSegments?.length ?? 0} segments</span>
        <span>
          {project.generatedStructuredState?.entities.length ?? 0} entities
        </span>
      </div>
      <StoryReadonlyBlock
        label="Generated system prompt"
        value={project.generatedSystemPrompt}
        placeholder="Generated prompt will appear here."
      />
      <StoryReadonlyBlock
        label="Generated story state"
        value={project.generatedStoryState}
        placeholder="Generated state will appear here."
      />
    </div>
  );
}

export function MainEntitySelector({
  characters,
  value,
  onChange,
}: {
  characters: StoryProjectDetail["characters"];
  value: string | null;
  onChange: (entityId: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      Main character
      <select
        className="app-editor-small-select"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">None</option>
        {characters.map((character) => (
          <option key={character.entityId} value={character.entityId}>
            {character.name}
            {character.isPlayer ? " (player)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ExportDownloadButton({
  busy,
  onExport,
}: {
  busy: boolean;
  onExport: () => void;
}) {
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={onExport}>
      <Download className="mr-1 h-4 w-4" />
      Download Export
    </Button>
  );
}

export function StoryImportCard({
  busy,
  onImport,
}: {
  busy: boolean;
  onImport: (input: ImportReviewInput) => void;
}) {
  const systemPromptRef = useRef<HTMLInputElement>(null);
  const storyStateRef = useRef<HTMLInputElement>(null);

  function handleFiles() {
    const input: ImportReviewInput = {};
    const systemFile = systemPromptRef.current?.files?.[0];
    const stateFile = storyStateRef.current?.files?.[0];

    const readers: Promise<void>[] = [];

    if (systemFile) {
      readers.push(
        systemFile.text().then((text) => {
          input.systemPromptMarkdown = text;
        }),
      );
    }
    if (stateFile) {
      readers.push(
        stateFile.text().then((text) => {
          input.storyStateMarkdown = text;
        }),
      );
    }

    if (readers.length === 0) return;

    void Promise.all(readers).then(() => {
      onImport(input);
      if (systemPromptRef.current) systemPromptRef.current.value = "";
      if (storyStateRef.current) storyStateRef.current.value = "";
    });
  }

  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Import Markdown</h2>
        <p className="app-editor-summary">
          Upload system prompt and/or story state markdown files.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        System prompt (.md)
        <input
          ref={systemPromptRef}
          type="file"
          accept=".md,.txt"
          className="text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Story state (.md)
        <input
          ref={storyStateRef}
          type="file"
          accept=".md,.txt"
          className="text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-foreground"
        />
      </label>
      <Button variant="outline" size="sm" disabled={busy} onClick={handleFiles}>
        <Upload className="mr-1 h-4 w-4" />
        Review Import
      </Button>
    </div>
  );
}

export function MarkdownExportButtons({
  project,
  onDownload,
}: {
  project: StoryProjectDetail;
  onDownload: (filename: string, content: string) => void;
}) {
  const baseName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "story";

  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Markdown Exports</h2>
        <p className="app-editor-summary">
          Download individual files as markdown.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!project.generatedSystemPrompt}
          onClick={() =>
            onDownload(
              `${baseName}-system-prompt.md`,
              project.generatedSystemPrompt,
            )
          }
        >
          <FileDown className="mr-1 h-4 w-4" />
          System Prompt
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!project.generatedStoryState}
          onClick={() =>
            onDownload(
              `${baseName}-story-state.md`,
              project.generatedStoryState,
            )
          }
        >
          <FileDown className="mr-1 h-4 w-4" />
          Story State
        </Button>
        {project.characters.map((character) => {
          const content = character.importedMarkdown ?? null;
          const charSlug =
            character.name.replace(/[^a-zA-Z0-9_-]/g, "_") || character.id;
          return (
            <Button
              key={character.id}
              variant="outline"
              size="sm"
              disabled={!content}
              onClick={() => {
                if (content) {
                  onDownload(`${baseName}-${charSlug}.md`, content);
                }
              }}
            >
              <FileDown className="mr-1 h-4 w-4" />
              {character.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
