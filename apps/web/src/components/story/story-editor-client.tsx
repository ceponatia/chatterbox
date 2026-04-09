"use client";

import { useRouter } from "next/navigation";
import {
  StoryEditorHeader,
  StoryCharactersCard,
  StoryGeneratedOutputCard,
  StoryLoadingState,
  StoryMetadataCard,
  StoryMissingState,
} from "@/components/story/story-editor-client-sections";
import { SystemPromptEditor } from "@/components/story/system-prompt-editor";
import {
  useStoryEditorActions,
  useStoryProjectData,
} from "@/components/story/use-story-editor";

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
    refreshProject: story.refreshProject,
    setError: story.setError,
  });

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
            <div className="app-story-grid">
              <section className="app-story-stack">
                <StoryMetadataCard
                  draftName={story.draftName}
                  draftDescription={story.draftDescription}
                  onNameChange={story.setDraftName}
                  onDescriptionChange={story.setDraftDescription}
                />
                <SystemPromptEditor
                  overrides={story.draftOverrides}
                  onOverridesChange={story.setDraftOverrides}
                />
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

              <section className="app-story-stack">
                <StoryGeneratedOutputCard project={story.project} />
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
