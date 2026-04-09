"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { persistActiveConversationId } from "@/lib/active-conversation";
import {
  createStoryCharacter,
  deleteStoryCharacter,
  launchStoryProject,
  loadStoryProject,
  regenerateStoryProject,
  updateStoryProject,
} from "@/lib/story-project-client";
import type {
  SegmentOverrides,
  StoryProjectDetail,
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

  return {
    busyAction,
    status,
    handleSave,
    handleGenerate,
    handleLaunch,
    handleCreateCharacter,
    handleDeleteCharacter,
  };
}
