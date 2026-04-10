"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { persistActiveConversationId } from "@/lib/active-conversation";
import {
  createStoryCharacter,
  deleteStoryCharacter,
  exportStoryProject,
  importStoryProject,
  launchStoryProject,
  loadStoryProject,
  regenerateStoryProject,
  updateStoryProject,
} from "@/lib/story-project-client";
import type {
  ImportMode,
  PromptBlueprint,
  RuntimeSeed,
  SegmentOverrides,
  StoryProjectDetail,
  StoryProjectImportInput,
} from "@/lib/story-project-types";
import { getDefaultSegmentOverrides } from "@/lib/system-prompt-schema";

async function runStoryEditorAction(
  action: string,
  setBusyAction: (value: string | null) => void,
  setError: (value: string | null) => void,
  setStatus: (value: string | null) => void,
  work: () => Promise<void>,
) {
  setBusyAction(action);
  setError(null);
  setStatus(null);
  try {
    await work();
  } catch (nextError) {
    setError(nextError instanceof Error ? nextError.message : "Action failed");
  } finally {
    setBusyAction(null);
  }
}

export function useStoryProjectData(storyId: string) {
  const [project, setProject] = useState<StoryProjectDetail | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftOverrides, setDraftOverrides] = useState<SegmentOverrides>(
    getDefaultSegmentOverrides(),
  );
  const [draftMainEntityId, setDraftMainEntityId] = useState<string | null>(
    null,
  );
  const [draftBlueprint, setDraftBlueprint] = useState<PromptBlueprint | null>(
    null,
  );
  const [draftRuntimeSeed, setDraftRuntimeSeed] = useState<RuntimeSeed | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextProject = await loadStoryProject(storyId);
        if (!active) return;
        setProject(nextProject);
        setDraftName(nextProject.name);
        setDraftDescription(nextProject.description);
        setDraftOverrides(
          nextProject.segmentOverrides ?? getDefaultSegmentOverrides(),
        );
        setDraftMainEntityId(
          nextProject.mainEntityId ??
            nextProject.characters.find((c) => c.isPlayer)?.entityId ??
            null,
        );
        setDraftBlueprint(nextProject.promptBlueprint ?? null);
        setDraftRuntimeSeed(nextProject.runtimeSeed ?? null);
        setError(null);
      } catch (nextError) {
        if (!active) return;
        setError(
          nextError instanceof Error ? nextError.message : "Load failed",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [storyId]);

  async function refreshProject() {
    const nextProject = await loadStoryProject(storyId);
    setProject(nextProject);
    setDraftName(nextProject.name);
    setDraftDescription(nextProject.description);
    setDraftOverrides(
      nextProject.segmentOverrides ?? getDefaultSegmentOverrides(),
    );
    setDraftMainEntityId(
      nextProject.mainEntityId ??
        nextProject.characters.find((c) => c.isPlayer)?.entityId ??
        null,
    );
    setDraftBlueprint(nextProject.promptBlueprint ?? null);
    setDraftRuntimeSeed(nextProject.runtimeSeed ?? null);
    return nextProject;
  }

  return {
    project,
    setProject,
    draftName,
    setDraftName,
    draftDescription,
    setDraftDescription,
    draftOverrides,
    setDraftOverrides,
    draftMainEntityId,
    setDraftMainEntityId,
    draftBlueprint,
    setDraftBlueprint,
    draftRuntimeSeed,
    setDraftRuntimeSeed,
    loading,
    error,
    setError,
    refreshProject,
  };
}

export function useStoryEditorActions({
  storyId,
  router,
  project,
  setProject,
  draftName,
  draftDescription,
  draftOverrides,
  draftMainEntityId,
  draftBlueprint,
  draftRuntimeSeed,
  refreshProject,
  setError,
}: {
  storyId: string;
  router: ReturnType<typeof useRouter>;
  project: StoryProjectDetail | null;
  setProject: (value: StoryProjectDetail) => void;
  draftName: string;
  draftDescription: string;
  draftOverrides: SegmentOverrides;
  draftMainEntityId: string | null;
  draftBlueprint: PromptBlueprint | null;
  draftRuntimeSeed: RuntimeSeed | null;
  refreshProject: () => Promise<StoryProjectDetail>;
  setError: (value: string | null) => void;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const runAction = (action: string, work: () => Promise<void>) =>
    runStoryEditorAction(action, setBusyAction, setError, setStatus, work);

  async function handleSave() {
    await runAction("save", async () => {
      const nextProject = await updateStoryProject(storyId, {
        name: draftName,
        description: draftDescription,
        segmentOverrides: draftOverrides,
        mainEntityId: draftMainEntityId,
        promptBlueprint: draftBlueprint,
        runtimeSeed: draftRuntimeSeed,
      });
      setProject(nextProject);
      setStatus("Project saved and regenerated.");
    });
  }

  async function handleGenerate() {
    await runAction("generate", async () => {
      const nextProject = await regenerateStoryProject(storyId);
      setProject(nextProject);
      setStatus("Generated artifacts refreshed.");
    });
  }

  async function handleLaunch() {
    await runAction("launch", async () => {
      const launched = await launchStoryProject(storyId);
      persistActiveConversationId(launched.conversationId);
      router.push("/");
    });
  }

  async function handleCreateCharacter() {
    await runAction("new-character", async () => {
      const nextIndex = (project?.characters.length ?? 0) + 1;
      await createStoryCharacter(storyId, {
        name: `Character ${nextIndex}`,
        role: "supporting",
        importedMarkdown: null,
      });
      await refreshProject();
      setStatus("Character created.");
    });
  }

  async function handleDeleteCharacter(characterId: string) {
    const character = project?.characters.find(
      (item) => item.id === characterId,
    );
    await runAction(`char-del-${characterId}`, async () => {
      await deleteStoryCharacter(storyId, characterId);
      await refreshProject();
      setStatus(`Removed ${character?.name ?? "character"}.`);
    });
  }

  async function handleExportDownload() {
    await runAction("export", async () => {
      const payload = await exportStoryProject(storyId);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project?.name ?? "story"}-export.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("Export downloaded.");
    });
  }

  async function handleImport(
    input: StoryProjectImportInput,
    mode: ImportMode,
  ) {
    await runAction("import", async () => {
      const nextProject = await importStoryProject(storyId, {
        ...input,
        mode,
      });
      setProject(nextProject);
      setStatus(`Import complete (${mode}).`);
    });
  }

  function downloadMarkdownFile(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return {
    busyAction,
    status,
    handleSave,
    handleGenerate,
    handleLaunch,
    handleCreateCharacter,
    handleDeleteCharacter,
    handleExportDownload,
    handleImport,
    downloadMarkdownFile,
  };
}
