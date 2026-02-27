"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useMemo, useCallback } from "react";
import { Settings as SettingsIcon, BookOpen, ScrollText, Trash2, Sparkles, PanelLeftOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { TurnCounter } from "@/components/chat/turn-counter";
import { SystemPromptEditor } from "@/components/sidebar/system-prompt-editor";
import { StoryStateEditor } from "@/components/sidebar/story-state-editor";
import { SettingsPanel } from "@/components/sidebar/settings-panel";
import { ConversationList } from "@/components/sidebar/conversation-list";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_STORY_STATE, DEFAULT_SETTINGS } from "@/lib/defaults";
import type { Settings } from "@/lib/defaults";
import { useConversationManager } from "@/lib/hooks/use-conversation-manager";
import { useSummarization } from "@/lib/hooks/use-summarization";
import { useMessageActions } from "@/lib/hooks/use-message-actions";

// Module-level config that the transport body function reads at request time.
const liveConfig = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  storyState: DEFAULT_STORY_STATE,
  settings: DEFAULT_SETTINGS as Settings,
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
        }),
      }),
    []
  );

  const { messages, sendMessage, stop, status, setMessages } = useChat({ transport });
  const isLoading = status === "submitted" || status === "streaming";

  const syncConfig = useCallback((c: { systemPrompt: string; storyState: string; settings: Settings }) => {
    liveConfig.systemPrompt = c.systemPrompt;
    liveConfig.storyState = c.storyState;
    liveConfig.settings = c.settings;
  }, []);

  const conv = useConversationManager({
    messages,
    setMessages,
    onConfigSync: syncConfig,
    onConversationSwitch: () => summarization.reset(),
  });

  const summarization = useSummarization({
    messages,
    isLoading,
    autoSummarizeInterval: conv.settings.autoSummarizeInterval,
    liveConfig,
    onAccept: conv.updateStoryStateFromSummary,
  });

  const msgActions = useMessageActions({ messages, setMessages, sendMessage });

  // --- Config sidebar state ---
  const [configOpen, setConfigOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("story-state");

  const sidebarContent = (
    <SidebarContent
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      conv={conv}
      summarization={summarization}
    />
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          conv={conv}
          messages={messages}
          isLoading={isLoading}
          summarization={summarization}
          configSheet={{ open: configOpen, setOpen: setConfigOpen, content: sidebarContent }}
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
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <h2 className="text-sm font-semibold">Configuration</h2>
          {summarization.hasPendingReview && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
              Review pending
            </Badge>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {sidebarContent}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components extracted to reduce per-function LOC / cyclomatic complexity
// ---------------------------------------------------------------------------

function SidebarContent({
  activeTab,
  setActiveTab,
  conv,
  summarization,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  conv: ReturnType<typeof useConversationManager>;
  summarization: ReturnType<typeof useSummarization>;
}) {
  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="story-state" className="relative flex-1">
            <ScrollText className="mr-1 h-3 w-3" />
            Story State
            {summarization.hasPendingReview && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="system-prompt" className="flex-1">
            <BookOpen className="mr-1 h-3 w-3" />
            System Prompt
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
            review={{
              active: summarization.hasPendingReview,
              proposedStoryState: summarization.proposedStoryState,
              currentStoryState: conv.storyState,
              isGenerating: summarization.isSummarizing,
              onAccept: summarization.handleAcceptSummary,
              onReject: summarization.handleRejectSummary,
            }}
          />
        </TabsContent>
        <TabsContent value="system-prompt" className="mt-4">
          <SystemPromptEditor
            value={conv.systemPrompt}
            onChange={conv.handleSystemPromptChange}
            onImport={conv.handleSystemPromptImport}
            onReset={conv.handleSystemPromptReset}
            baseline={conv.systemPromptBaseline}
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
}

function ConversationDrawer({ conv }: { conv: ReturnType<typeof useConversationManager> }) {
  return (
    <Sheet open={conv.convDrawerOpen} onOpenChange={conv.setConvDrawerOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Conversations">
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
  summarization,
  configSheet,
  onClearChat,
}: {
  conv: ReturnType<typeof useConversationManager>;
  messages: ReturnType<typeof useChat>["messages"];
  isLoading: boolean;
  summarization: ReturnType<typeof useSummarization>;
  configSheet: { open: boolean; setOpen: (open: boolean) => void; content: React.ReactNode };
  onClearChat: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
      <div className="flex items-center gap-3">
        <ConversationDrawer conv={conv} />
        <h1 className="text-lg font-bold">RP Sketcher</h1>
        <TurnCounter
          messages={messages}
          autoSummarizeInterval={conv.settings.autoSummarizeInterval}
        /><br />
        <p className="text-xs text-muted-foreground">
          Model: <code className="rounded bg-muted px-1 py-0.5">z-ai/glm-5</code>
          <br />
          Quick n&apos; dirty RP interface for model testing
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={conv.handleNewConversation}
          title="New chat"
        >
          <Plus className="mr-1 h-4 w-4" />
          New
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={summarization.triggerSummarize}
          disabled={messages.length < 2 || isLoading || summarization.isSummarizing}
          title="Summarize & update Story State"
        >
          <Sparkles className="mr-1 h-4 w-4" />
          Summarize
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearChat}
          disabled={messages.length === 0}
          title="Clear chat"
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Clear
        </Button>
        <Sheet open={configSheet.open} onOpenChange={configSheet.setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="relative lg:hidden">
              <SettingsIcon className="mr-1 h-4 w-4" />
              Configure
              {summarization.hasPendingReview && (
                <Badge
                  variant="destructive"
                  className="absolute -right-1.5 -top-1.5 h-4 min-w-4 px-1 text-[10px] leading-none"
                >
                  !
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Configuration</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{configSheet.content}</div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
