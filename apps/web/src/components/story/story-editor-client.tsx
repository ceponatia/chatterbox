"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ExportDownloadButton,
  MainEntitySelector,
  MarkdownExportButtons,
  StoryEditorHeader,
  StoryCharactersCard,
  StoryGeneratedOutputCard,
  StoryImportCard,
  StoryLoadingState,
  StoryMetadataCard,
  StoryMissingState,
} from "@/components/story/story-editor-client-sections";
import {
  ImportReviewModal,
  type ImportReviewInput,
} from "@/components/story/import-review-modal";
import { PromptBlueprintEditor } from "@/components/story/prompt-blueprint-editor";
import { RelationshipEditor } from "@/components/story/relationship-editor";
import { RuntimeSeedEditor } from "@/components/story/runtime-seed-editor";
import { SegmentInspector } from "@/components/story/segment-inspector";
import { SystemPromptEditor } from "@/components/story/system-prompt-editor";
import {
  useStoryEditorActions,
  useStoryProjectData,
} from "@/components/story/use-story-editor";

const STORY_TABS = [
  { id: "overview", label: "Overview" },
  { id: "system-prompt", label: "System Prompt" },
  { id: "characters", label: "Characters" },
  { id: "relationships", label: "Relationships" },
  { id: "runtime-seed", label: "Runtime Seed" },
  { id: "preview-export", label: "Preview / Export" },
] as const;

export function StoryEditorClient({ storyId }: { storyId: string }) {
  const router = useRouter();
  const story = useStoryProjectData(storyId);
  const actions = useStoryEditorActions({
    storyId,
    router,
    project: story.project,
    setProject: story.setProject,
    draftName: story.draftName,
    draftDescription: story.draftDescription,
    draftOverrides: story.draftOverrides,
    draftMainEntityId: story.draftMainEntityId,
    draftBlueprint: story.draftBlueprint,
    draftRuntimeSeed: story.draftRuntimeSeed,
    refreshProject: story.refreshProject,
    setError: story.setError,
  });

  const [importReviewOpen, setImportReviewOpen] = useState(false);
  const [importInput, setImportInput] = useState<ImportReviewInput>({});

  const openImportReview = useCallback((input: ImportReviewInput) => {
    setImportInput(input);
    setImportReviewOpen(true);
  }, []);

  if (story.loading) return <StoryLoadingState />;
  if (!story.project) return <StoryMissingState />;

  return (
    <div className="app-shell safe-top">
      <div className="app-chat-pane">
        <StoryEditorHeader
          project={story.project}
          busy={actions.busyAction !== null}
          onSave={() => void actions.handleSave()}
          onGenerate={() => void actions.handleGenerate()}
          onLaunch={() => void actions.handleLaunch()}
        />
        <main className="app-story-main">
          <div className="app-story-column">
            {story.error && (
              <div className="app-editor-warning text-xs">{story.error}</div>
            )}
            {actions.status && (
              <div className="app-editor-summary text-xs">{actions.status}</div>
            )}
            <Tabs defaultValue="overview">
              <TabsList className="app-tabs-list">
                {STORY_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="app-tabs-trigger flex-1"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <section className="app-story-stack">
                  <StoryMetadataCard
                    draftName={story.draftName}
                    draftDescription={story.draftDescription}
                    onNameChange={story.setDraftName}
                    onDescriptionChange={story.setDraftDescription}
                  />
                  <div className="app-story-card app-story-stack">
                    <h2 className="text-sm font-semibold">Main Character</h2>
                    <MainEntitySelector
                      characters={story.project.characters}
                      value={story.draftMainEntityId}
                      onChange={story.setDraftMainEntityId}
                    />
                  </div>
                  <StoryImportCard
                    busy={actions.busyAction !== null}
                    onImport={openImportReview}
                  />
                </section>
              </TabsContent>

              <TabsContent value="system-prompt" className="mt-4">
                <section className="app-story-stack">
                  <PromptBlueprintEditor
                    blueprint={story.draftBlueprint}
                    onChange={story.setDraftBlueprint}
                  />
                  <SystemPromptEditor
                    overrides={story.draftOverrides}
                    onOverridesChange={story.setDraftOverrides}
                  />
                  <SegmentInspector
                    segments={story.project.generatedSegments}
                    overrides={story.draftOverrides}
                    hasBlueprint={story.draftBlueprint !== null}
                    hasImportedPrompt={Boolean(
                      story.project.importedSystemPrompt?.trim(),
                    )}
                  />
                </section>
              </TabsContent>

              <TabsContent value="characters" className="mt-4">
                <section className="app-story-stack">
                  <StoryCharactersCard
                    project={story.project}
                    storyId={storyId}
                    busy={actions.busyAction !== null}
                    onCreate={() => void actions.handleCreateCharacter()}
                    onDeleteCharacter={(characterId) =>
                      actions.handleDeleteCharacter(characterId)
                    }
                  />
                </section>
              </TabsContent>

              <TabsContent value="relationships" className="mt-4">
                <section className="app-story-stack">
                  <RelationshipEditor
                    storyId={storyId}
                    relationships={story.project.relationships}
                    characters={story.project.characters}
                    onRelationshipsChange={(next) =>
                      story.setProject({
                        ...story.project!,
                        relationships: next,
                      })
                    }
                    refreshProject={story.refreshProject}
                  />
                </section>
              </TabsContent>

              <TabsContent value="runtime-seed" className="mt-4">
                <section className="app-story-stack">
                  <RuntimeSeedEditor
                    seed={story.draftRuntimeSeed}
                    onChange={story.setDraftRuntimeSeed}
                  />
                </section>
              </TabsContent>

              <TabsContent value="preview-export" className="mt-4">
                <section className="app-story-stack">
                  <StoryGeneratedOutputCard project={story.project} />
                  <div className="app-story-card flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">Export</h2>
                      <p className="app-editor-summary">
                        Download the full project as JSON.
                      </p>
                    </div>
                    <ExportDownloadButton
                      busy={actions.busyAction !== null}
                      onExport={() => void actions.handleExportDownload()}
                    />
                  </div>
                  <MarkdownExportButtons
                    project={story.project}
                    onDownload={actions.downloadMarkdownFile}
                  />
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
      {story.project && (
        <ImportReviewModal
          open={importReviewOpen}
          onOpenChange={setImportReviewOpen}
          input={importInput}
          project={story.project}
          busy={actions.busyAction !== null}
          onConfirm={(mode) => {
            setImportReviewOpen(false);
            void actions.handleImport(importInput, mode);
          }}
        />
      )}
    </div>
  );
}
