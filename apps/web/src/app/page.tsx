"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useMemo, useCallback, memo } from "react";
import type { StateHistoryEntry } from "@/lib/state-history";
import { useStateHistoryEntries } from "@/lib/hooks/use-state-history";
import {
  Settings as SettingsIcon,
  BookOpen,
  ScrollText,
  Trash2,
  Sparkles,
  PanelLeftOpen,
  Plus,
  SlidersHorizontal,
  ArrowLeft,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMobileSidebar } from "@/lib/hooks/use-mobile-sidebar";
import { Separator } from "@/components/ui/separator";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { TurnCounter } from "@/components/chat/turn-counter";
import { SystemPromptEditor } from "@/components/sidebar/system-prompt-editor";
import { StoryStateEditor } from "@/components/sidebar/story-state-editor";
import { SettingsPanel } from "@/components/sidebar/settings-panel";
import { ConversationList } from "@/components/sidebar/conversation-list";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_STORY_STATE,
  DEFAULT_SETTINGS,
} from "@/lib/defaults";
import type { Settings } from "@/lib/defaults";
import { useConversationManager } from "@/lib/hooks/use-conversation-manager";
import type { SyncStatus } from "@/lib/hooks/use-sync-status";
import { useMessageActions } from "@/lib/hooks/use-message-actions";
import { useAssemblyTracker } from "@/lib/hooks/use-assembly-tracker";
import { useStatePipeline } from "@/lib/hooks/use-state-pipeline";

// Module-level config that the transport body function reads at request time.
const liveConfig = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  storyState: DEFAULT_STORY_STATE,
  settings: DEFAULT_SETTINGS as Settings,
  lastIncludedAt: {} as Record<string, number>,
  customSegments: null as SerializedSegment[] | null,
};

export default function Home() {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          systemPrompt: liveConfig.systemPrompt,
          storyState: liveConfig.storyState,
          settings: liveConfig.settings,
          lastIncludedAt: liveConfig.lastIncludedAt,
          customSegments: liveConfig.customSegments,
        }),
      }),
    [],
  );

  const { messages, sendMessage, stop, status, setMessages } = useChat({
    transport,
  });
  const isLoading = status === "submitted" || status === "streaming";

  const syncConfig = useCallback(
    (c: {
      systemPrompt: string;
      storyState: string;
      settings: Settings;
      lastIncludedAt?: Record<string, number>;
      customSegments?: SerializedSegment[] | null;
    }) => {
      liveConfig.systemPrompt = c.systemPrompt;
      liveConfig.storyState = c.storyState;
      liveConfig.settings = c.settings;
      if (c.lastIncludedAt) liveConfig.lastIncludedAt = c.lastIncludedAt;
      if (c.customSegments !== undefined)
        liveConfig.customSegments = c.customSegments;
    },
    [],
  );

  const conv = useConversationManager({
    messages,
    setMessages,
    onConfigSync: syncConfig,
  });

  useAssemblyTracker({
    messages,
    storyState: conv.storyState,
    lastIncludedAt: conv.lastIncludedAt,
    setLastIncludedAt: conv.setLastIncludedAt,
    customSegments: conv.customSegments,
  });

  const handleCascadeResets = useCallback(
    (ids: string[]) =>
      conv.setLastIncludedAt((p) => {
        const n = { ...p };
        for (const id of ids) n[id] = 0;
        return n;
      }),
    [conv.setLastIncludedAt],
  );
  const pipeline = useStatePipeline({
    messages,
    isLoading,
    storyState: conv.storyState,
    conversationId: conv.activeConvId,
    onStateUpdate: conv.updateStoryStateFromSummary,
    autoSummarizeInterval: conv.settings.autoSummarizeInterval,
    onCascadeResets: handleCascadeResets,
    lastPipelineTurn: conv.lastPipelineTurn,
    setLastPipelineTurn: conv.setLastPipelineTurn,
  });
  const stateHistory = useStateHistoryEntries(
    conv.activeConvId,
    pipeline.historyVersion,
  );
  const msgActions = useMessageActions({ messages, setMessages, sendMessage });
  const [activeTab, setActiveTab] = useState("story-state");
  const mobile = useMobileSidebar();
  const sidebar = (
    <SidebarContent
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      conv={conv}
      recentlyUpdated={pipeline.recentlyUpdated}
      stateHistory={stateHistory}
      messages={messages}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden safe-top">
      <MobileSidebarOverlay open={mobile.open} onClose={mobile.close}>
        {sidebar}
      </MobileSidebarOverlay>

      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          conv={conv}
          messages={messages}
          isLoading={isLoading}
          onTriggerPipeline={pipeline.triggerPipeline}
          onOpenMobileSidebar={mobile.toggle}
          onClearChat={msgActions.handleClearChat}
        />

        <MessageList
          messages={messages}
          isLoading={isLoading}
          onEdit={msgActions.handleEditMessage}
          onDelete={msgActions.handleDeleteMessage}
          onRetry={msgActions.handleRetryMessage}
          onEditAndGenerate={msgActions.handleEditAndGenerate}
        />

        <ChatInput
          input={msgActions.input}
          onInputChange={msgActions.setInput}
          onSubmit={msgActions.handleSend}
          isLoading={isLoading}
          onStop={stop}
        />
      </div>

      {/* Persistent sidebar — desktop only */}
      <aside className="hidden w-125 shrink-0 border-l lg:flex lg:flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
          <h2 className="text-sm font-semibold">Configuration</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{sidebar}</div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components extracted to reduce per-function LOC / cyclomatic complexity
// ---------------------------------------------------------------------------

function MobileSidebarOverlay({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal={true}
      aria-label="Configuration"
      className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4 safe-top">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label="Back to chat"
          onClick={onClose}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">Configuration</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 safe-bottom safe-x">
        {children}
      </div>
    </div>
  );
}

const SYNC_DOT_COLORS: Record<SyncStatus, string> = {
  saved: "bg-green-500",
  pending: "bg-yellow-500",
  error: "bg-red-500",
};

const SYNC_DOT_TITLES: Record<SyncStatus, string> = {
  saved: "Saved and up to date",
  pending: "Saving…",
  error: "Sync error — LLM may see stale data",
};

function SyncDot({ status, pulse }: { status: SyncStatus; pulse?: boolean }) {
  return (
    <>
      <span
        className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${SYNC_DOT_COLORS[status]} ${pulse ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      <span className="sr-only">{SYNC_DOT_TITLES[status]}</span>
    </>
  );
}

const SidebarContent = memo(function SidebarContent({
  activeTab,
  setActiveTab,
  conv,
  recentlyUpdated,
  stateHistory,
  messages,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  conv: ReturnType<typeof useConversationManager>;
  recentlyUpdated: boolean;
  stateHistory: StateHistoryEntry[];
  messages: ReturnType<typeof useChat>["messages"];
}) {
  const turnNumber = messages.filter((m) => m.role === "user").length;
  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="story-state" className="relative flex-1">
            <ScrollText className="mr-1 h-3 w-3" />
            Story State
            <SyncDot
              status={recentlyUpdated ? "saved" : conv.storyStateSync}
              pulse={recentlyUpdated}
            />
          </TabsTrigger>
          <TabsTrigger value="system-prompt" className="relative flex-1">
            <BookOpen className="mr-1 h-3 w-3" />
            System Prompt
            <SyncDot status={conv.systemPromptSync} />
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-1">
            <SettingsIcon className="mr-1 h-3 w-3" />
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="story-state" className="mt-4">
          <StoryStateEditor
            value={conv.storyState}
            onChange={conv.handleStoryStateChange}
            onImport={conv.handleStoryStateImport}
            onReset={conv.handleStoryStateReset}
            baseline={conv.storyStateBaseline}
            lastUpdated={conv.storyStateLastUpdated}
            recentlyUpdated={recentlyUpdated}
            stateHistory={stateHistory}
            structuredState={conv.structuredState}
            onStructuredStateUpdate={(s) =>
              conv.handleStructuredStateUpdate(s, conv.markStoryStateError)
            }
          />
        </TabsContent>
        <TabsContent value="system-prompt" className="mt-4">
          <SystemPromptEditor
            value={conv.systemPrompt}
            onChange={conv.handleSystemPromptChange}
            onImport={conv.handleSystemPromptImport}
            onReset={conv.handleSystemPromptReset}
            baseline={conv.systemPromptBaseline}
            segments={conv.customSegments}
            onSegmentUpdate={conv.handleSegmentUpdate}
            lastIncludedAt={conv.lastIncludedAt}
            turnNumber={turnNumber}
          />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsPanel
            settings={conv.settings}
            onChange={conv.handleSettingsChange}
          />
        </TabsContent>
      </Tabs>
      <Separator className="my-4" />
      <p className="text-xs text-muted-foreground">
        Model: <code className="rounded bg-muted px-1 py-0.5">z-ai/glm-5</code>
        <br />
        Context: 202.8K tokens · Max output: 131.1K tokens
      </p>
    </>
  );
});

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

function ChatHeader({
  conv,
  messages,
  isLoading,
  onTriggerPipeline,
  onOpenMobileSidebar,
  onClearChat,
}: {
  conv: ReturnType<typeof useConversationManager>;
  messages: ReturnType<typeof useChat>["messages"];
  isLoading: boolean;
  onTriggerPipeline: () => void;
  onOpenMobileSidebar: () => void;
  onClearChat: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-3 lg:h-16 lg:px-4">
      <div className="flex items-center gap-2 lg:gap-3">
        <ConversationDrawer conv={conv} />
        <h1 className="hidden text-base font-bold lg:inline lg:text-lg">
          RP Sketcher
        </h1>
        <TurnCounter
          messages={messages}
          autoSummarizeInterval={conv.settings.autoSummarizeInterval}
          lastPipelineTurn={conv.lastPipelineTurn}
        />
        <p className="hidden text-xs text-muted-foreground lg:block">
          Model:{" "}
          <code className="rounded bg-muted px-1 py-0.5">z-ai/glm-5</code>
          <br />
          Quick n&apos; dirty RP interface for model testing
        </p>
      </div>
      <div className="flex items-center gap-1 lg:gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={conv.handleNewConversation}
          title="New chat"
          className="h-8 w-8 p-0 lg:h-9 lg:w-auto lg:px-3"
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
          className="h-8 w-8 p-0 lg:h-9 lg:w-auto lg:px-3"
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
          className="h-8 w-8 p-0 lg:h-9 lg:w-auto lg:px-3"
        >
          <Trash2 className="h-4 w-4 lg:mr-1" />
          <span className="hidden lg:inline">Clear</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenMobileSidebar}
          title="Configure"
          className="h-8 w-8 p-0 lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
