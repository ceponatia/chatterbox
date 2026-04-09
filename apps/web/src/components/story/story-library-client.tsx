"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CopyPlus,
  FolderOpen,
  LibraryBig,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import {
  createStoryProject,
  deleteStoryProject,
  listStoryProjects,
} from "@/lib/story-project-client";
import type { StoryProjectSummary } from "@/lib/story-project-types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StoryLibraryHeader({
  onCreate,
  creating,
}: {
  onCreate: () => void;
  creating: boolean;
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
          <Link href="/" aria-label="Back to chat">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-base font-bold tracking-tight lg:text-lg">
            Story Library
          </h1>
          <p className="app-editor-summary">
            Import-first reusable story projects for launching chat snapshots.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild={true} variant="outline" size="sm">
          <Link href="/">
            <LibraryBig className="mr-1 h-4 w-4" />
            Chat
          </Link>
        </Button>
        <Button onClick={onCreate} disabled={creating}>
          <Plus className="mr-1 h-4 w-4" />
          New Story
        </Button>
      </div>
    </header>
  );
}

function StoryLibraryCard({
  story,
  busy,
  onDuplicate,
  onDelete,
}: {
  story: StoryProjectSummary;
  busy: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="app-story-card app-story-stack">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{story.name}</h2>
          <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
            {story.description || "No description yet."}
          </p>
        </div>
        <ConfirmDeleteButton onConfirm={onDelete} />
      </div>
      <div className="app-story-meta">
        <span>Mode: {story.authoringMode}</span>
        <span>{story.characterCount} characters</span>
        <span>{story.relationshipCount} relationships</span>
      </div>
      <p className="app-editor-summary">
        Updated {formatDate(story.updatedAt)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild={true} variant="outline" size="sm">
          <Link href={`/stories/${story.id}`}>
            <FolderOpen className="mr-1 h-4 w-4" />
            Open
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onDuplicate} disabled={busy}>
          <CopyPlus className="mr-1 h-4 w-4" />
          Duplicate
        </Button>
      </div>
    </div>
  );
}

function StoryLibraryBody({
  stories,
  loading,
  error,
  busyId,
  onDuplicate,
  onDelete,
}: {
  stories: StoryProjectSummary[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <main className="app-story-main">
      <div className="app-story-column">
        {error && <div className="app-editor-warning text-xs">{error}</div>}
        {loading ? (
          <div className="app-empty-state-card self-center">
            Loading stories…
          </div>
        ) : stories.length === 0 ? (
          <div className="app-empty-state-card self-center">
            <p className="text-sm font-semibold">No stories yet</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Create a blank story or duplicate an existing reusable project.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stories.map((story) => (
              <StoryLibraryCard
                key={story.id}
                story={story}
                busy={busyId === story.id}
                onDuplicate={() => onDuplicate(story.id)}
                onDelete={() => onDelete(story.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export function StoryLibraryClient() {
  const router = useRouter();
  const [stories, setStories] = useState<StoryProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextStories = await listStoryProjects();
        if (!active) return;
        setStories(nextStories);
        setError(null);
      } catch (nextError) {
        if (!active) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to load stories",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function refreshStories() {
    setStories(await listStoryProjects());
  }

  async function handleCreate() {
    setBusyId("create");
    try {
      const created = await createStoryProject({
        name: "Untitled Story",
        description: "",
      });
      router.push(`/stories/${created.id}`);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Create failed",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setBusyId(id);
    try {
      const duplicated = await createStoryProject({ duplicateFromId: id });
      router.push(`/stories/${duplicated.id}`);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Duplicate failed",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteStoryProject(id);
      await refreshStories();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Delete failed",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app-shell safe-top">
      <div className="app-chat-pane">
        <StoryLibraryHeader
          onCreate={() => void handleCreate()}
          creating={busyId === "create"}
        />
        <StoryLibraryBody
          stories={stories}
          loading={loading}
          error={error}
          busyId={busyId}
          onDuplicate={(id) => void handleDuplicate(id)}
          onDelete={(id) => void handleDelete(id)}
        />
      </div>
    </div>
  );
}
