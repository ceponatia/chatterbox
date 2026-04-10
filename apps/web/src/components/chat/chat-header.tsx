import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  BookCopy,
  BookOpen,
  GitFork,
  Plus,
  Sparkles,
  Trash2,
  PanelLeftOpen,
  PanelRightOpen,
  PanelRightClose,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ConversationList } from "@/components/sidebar/conversation-list";
import { TurnCounter } from "@/components/chat/turn-counter";
import { getModelEntry } from "@/lib/model-registry";
import { useConversationManager } from "@/lib/hooks/use-conversation-manager";

function ConversationDrawer({
  conv,
}: {
  conv: ReturnType<typeof useConversationManager>;
}) {
  return (
    <Sheet open={conv.convDrawerOpen} onOpenChange={conv.setConvDrawerOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Conversations"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Conversations</SheetTitle>
        </SheetHeader>
        <ConversationList
          conversations={conv.conversations}
          activeId={conv.activeConvId}
          onSelect={conv.handleSelectConversation}
          onDelete={conv.handleDeleteConversation}
          onNew={conv.handleNewConversation}
        />
      </SheetContent>
    </Sheet>
  );
}

function HeaderIdentity({
  messages,
  lastPipelineTurn,
  autoSummarizeInterval,
  modelLabel,
  storyProjectId,
  storyProjectName,
}: {
  messages: ReturnType<typeof useChat>["messages"];
  lastPipelineTurn: number;
  autoSummarizeInterval: number;
  modelLabel: string;
  storyProjectId: string | null;
  storyProjectName: string | null;
}) {
  return (
    <>
      <h1 className="hidden whitespace-nowrap text-base font-bold tracking-tight lg:inline lg:text-lg">
        RP Sketcher
      </h1>
      {storyProjectId && storyProjectName && (
        <Link
          href={`/stories/${storyProjectId}`}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title={`From story: ${storyProjectName}`}
        >
          <BookOpen className="h-3 w-3" />
          <span className="max-w-24 truncate lg:max-w-40">
            {storyProjectName}
          </span>
        </Link>
      )}
      <TurnCounter
        messages={messages}
        autoSummarizeInterval={autoSummarizeInterval}
        lastPipelineTurn={lastPipelineTurn}
      />
      <p className="hidden max-w-32 text-xs leading-tight text-muted-foreground xl:block">
        Model: <code className="app-code-chip">{modelLabel}</code>
        <br />
        Quick n&apos; dirty RP interface for model testing
      </p>
    </>
  );
}

function HeaderActions({
  conv,
  messages,
  isLoading,
  onTriggerPipeline,
  onForkToStory,
  forkInProgress,
  configSidebarOpen,
  onToggleConfigSidebar,
  onOpenMobileSidebar,
  mobileSidebarTriggerRef,
  onClearChat,
}: {
  conv: ReturnType<typeof useConversationManager>;
  messages: ReturnType<typeof useChat>["messages"];
  isLoading: boolean;
  onTriggerPipeline: () => void;
  onForkToStory: () => void;
  forkInProgress: boolean;
  configSidebarOpen: boolean;
  onToggleConfigSidebar: () => void;
  onOpenMobileSidebar: () => void;
  mobileSidebarTriggerRef: React.RefObject<HTMLButtonElement | null>;
  onClearChat: () => void;
}) {
  const hasContent = conv.systemPrompt.trim() || conv.storyState.trim();
  return (
    <div className="flex items-center gap-1 lg:gap-2">
      <Button
        asChild
        variant="ghost"
        size="sm"
        title="Story library"
        className="app-toolbar-button"
      >
        <Link href="/stories">
          <BookCopy className="h-4 w-4 lg:mr-1" />
          <span className="hidden lg:inline">Stories</span>
        </Link>
      </Button>
      {!conv.storyProjectId && hasContent && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onForkToStory}
          disabled={forkInProgress}
          title="Fork to Story Project"
          className="app-toolbar-button"
        >
          <GitFork className="h-4 w-4 lg:mr-1" />
          <span className="hidden lg:inline">Fork</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={conv.handleNewConversation}
        title="New chat"
        className="app-toolbar-button"
      >
        <Plus className="h-4 w-4 lg:mr-1" />
        <span className="hidden lg:inline">New</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onTriggerPipeline}
        disabled={messages.length < 2 || isLoading}
        title="Update Story State"
        className="app-toolbar-button"
      >
        <Sparkles className="h-4 w-4 lg:mr-1" />
        <span className="hidden lg:inline">Update State</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearChat}
        disabled={messages.length === 0}
        title="Clear chat"
        className="app-toolbar-button"
      >
        <Trash2 className="h-4 w-4 lg:mr-1" />
        <span className="hidden lg:inline">Clear</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleConfigSidebar}
        title={configSidebarOpen ? "Hide configuration" : "Show configuration"}
        className="app-toolbar-button hidden lg:inline-flex"
      >
        {configSidebarOpen ? (
          <PanelRightClose className="h-4 w-4 lg:mr-1" />
        ) : (
          <PanelRightOpen className="h-4 w-4 lg:mr-1" />
        )}
        <span className="hidden lg:inline">Config</span>
      </Button>
      <Button
        ref={mobileSidebarTriggerRef}
        variant="outline"
        size="sm"
        onClick={onOpenMobileSidebar}
        title="Configure"
        className="app-button-square lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function ChatHeader({
  conv,
  messages,
  isLoading,
  onTriggerPipeline,
  configSidebarOpen,
  onToggleConfigSidebar,
  onOpenMobileSidebar,
  mobileSidebarTriggerRef,
  onClearChat,
}: {
  conv: ReturnType<typeof useConversationManager>;
  messages: ReturnType<typeof useChat>["messages"];
  isLoading: boolean;
  onTriggerPipeline: () => void;
  configSidebarOpen: boolean;
  onToggleConfigSidebar: () => void;
  onOpenMobileSidebar: () => void;
  mobileSidebarTriggerRef: React.RefObject<HTMLButtonElement | null>;
  onClearChat: () => void;
}) {
  const router = useRouter();
  const [forkInProgress, setForkInProgress] = useState(false);
  const modelLabel = useMemo(
    () => getModelEntry(conv.settings.model)?.label ?? conv.settings.model,
    [conv.settings.model],
  );

  const handleForkToStory = useCallback(async () => {
    setForkInProgress(true);
    try {
      const createRes = await fetch("/api/story-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: conv.settings.model
            ? `Fork - ${new Date().toLocaleDateString()}`
            : "Forked Story",
          description: "Created from conversation",
        }),
      });
      if (!createRes.ok) throw new Error("Failed to create story project");
      const project = (await createRes.json()) as { id: string };

      const importRes = await fetch(
        `/api/story-projects/${project.id}/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemPromptMarkdown: conv.systemPrompt,
            storyStateMarkdown: conv.storyState,
          }),
        },
      );
      if (!importRes.ok) throw new Error("Failed to import conversation data");

      router.push(`/stories/${project.id}`);
    } catch (err) {
      console.error("Fork to story failed:", err);
    } finally {
      setForkInProgress(false);
    }
  }, [conv.systemPrompt, conv.storyState, conv.settings.model, router]);

  return (
    <header className="app-panel-header h-14 px-3 lg:h-16 lg:px-4">
      <div className="flex items-center gap-2 lg:gap-3">
        <ConversationDrawer conv={conv} />
        <HeaderIdentity
          messages={messages}
          lastPipelineTurn={conv.lastPipelineTurn}
          autoSummarizeInterval={conv.settings.autoSummarizeInterval}
          modelLabel={modelLabel}
          storyProjectId={conv.storyProjectId}
          storyProjectName={conv.storyProjectName}
        />
      </div>
      <HeaderActions
        conv={conv}
        messages={messages}
        isLoading={isLoading}
        onTriggerPipeline={onTriggerPipeline}
        onForkToStory={handleForkToStory}
        forkInProgress={forkInProgress}
        configSidebarOpen={configSidebarOpen}
        onToggleConfigSidebar={onToggleConfigSidebar}
        onOpenMobileSidebar={onOpenMobileSidebar}
        mobileSidebarTriggerRef={mobileSidebarTriggerRef}
        onClearChat={onClearChat}
      />
    </header>
  );
}
