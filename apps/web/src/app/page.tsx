"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useStateHistoryEntries } from "@/lib/hooks/use-state-history";
import { ArrowLeft, PanelRightClose } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useMobileSidebar } from "@/lib/hooks/use-mobile-sidebar";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatHeader } from "@/components/chat/chat-header";
import { HomeSidebarContent } from "@/components/sidebar/home-sidebar-content";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_STORY_STATE,
  DEFAULT_SETTINGS,
} from "@/lib/defaults";
import type { Settings } from "@/lib/defaults";
import { useConversationManager } from "@/lib/hooks/use-conversation-manager";
import { useMessageActions } from "@/lib/hooks/use-message-actions";
import { useDeleteAfterRollback } from "@/lib/hooks/use-delete-after-rollback";
import { useAssemblyTracker } from "@/lib/hooks/use-assembly-tracker";
import { useStatePipeline } from "@/lib/hooks/use-state-pipeline";
import { trapTabKey } from "@/lib/focus-trap";
import { scanPresenceFromAssistantMessage } from "@/lib/presence-scanner";

// Module-level config that the transport body function reads at request time.
const liveConfig = {
  conversationId: null as string | null,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  storyState: DEFAULT_STORY_STATE,
  settings: DEFAULT_SETTINGS as Settings,
  lastIncludedAt: {} as Record<string, number>,
  customSegments: null as SerializedSegment[] | null,
  presentEntityIds: [] as string[],
};

export default function Home() {
  const state = useHomeState();
  return <HomeLayout state={state} />;
}

function useLiveChatState() {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          conversationId: liveConfig.conversationId,
          systemPrompt: liveConfig.systemPrompt,
          storyState: liveConfig.storyState,
          settings: liveConfig.settings,
          lastIncludedAt: liveConfig.lastIncludedAt,
          customSegments: liveConfig.customSegments,
          presentEntityIds: liveConfig.presentEntityIds,
        }),
      }),
    [],
  );

  const chat = useChat({ transport });
  const isLoading = chat.status === "submitted" || chat.status === "streaming";

  const syncConfig = useCallback(
    (c: {
      conversationId?: string | null;
      systemPrompt: string;
      storyState: string;
      settings: Settings;
      lastIncludedAt?: Record<string, number>;
      customSegments?: SerializedSegment[] | null;
      presentEntityIds?: string[];
    }) => {
      if (c.conversationId !== undefined)
        liveConfig.conversationId = c.conversationId;
      liveConfig.systemPrompt = c.systemPrompt;
      liveConfig.storyState = c.storyState;
      liveConfig.settings = c.settings;
      if (c.lastIncludedAt) liveConfig.lastIncludedAt = c.lastIncludedAt;
      if (c.customSegments !== undefined)
        liveConfig.customSegments = c.customSegments;
      if (c.presentEntityIds !== undefined)
        liveConfig.presentEntityIds = c.presentEntityIds;
    },
    [],
  );

  return { chat, isLoading, syncConfig };
}

function useHomeState() {
  const { chat, isLoading, syncConfig } = useLiveChatState();
  const { messages, sendMessage, setMessages } = chat;

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
    presentEntityIds: conv.structuredState?.scene.presentEntityIds ?? [],
  });

  const setLastIncludedAt = conv.setLastIncludedAt;
  const onCascadeResets = useCallback(
    (ids: string[]) =>
      setLastIncludedAt((p) => {
        const n = { ...p };
        for (const id of ids) n[id] = 0;
        return n;
      }),
    [setLastIncludedAt],
  );

  const pipeline = useStatePipeline({
    messages,
    isLoading,
    storyState: conv.storyState,
    structuredState: conv.structuredState,
    model: conv.settings.model,
    conversationId: conv.activeConvId,
    onStateUpdate: conv.updateStoryStateFromSummary,
    autoSummarizeInterval: conv.settings.autoSummarizeInterval,
    onCascadeResets,
    customSegments: conv.customSegments,
    lastPipelineTurn: conv.lastPipelineTurn,
    setLastPipelineTurn: conv.setLastPipelineTurn,
  });

  const msgActions = useMessageActions({ messages, setMessages, sendMessage });
  const { handleDeleteAfterWithRollback, rollbackHistoryVersion } =
    useDeleteAfterRollback({
      messages,
      handleDeleteAfter: msgActions.handleDeleteAfter,
      storyState: conv.storyState,
      activeConvId: conv.activeConvId,
      model: conv.settings.model,
      setLastPipelineTurn: conv.setLastPipelineTurn,
      updateStoryStateFromSummary: conv.updateStoryStateFromSummary,
      onCascadeResets,
      customSegments: conv.customSegments,
    });

  useAssistantPresenceSync({
    isLoading,
    messages,
    structuredState: conv.structuredState,
    onStructuredStateUpdate: conv.handleStructuredStateUpdate,
  });

  return {
    chat,
    conv,
    pipeline,
    isLoading,
    stateHistory: useStateHistoryEntries(
      conv.activeConvId,
      pipeline.historyVersion + rollbackHistoryVersion,
    ),
    msgActions: {
      ...msgActions,
      handleDeleteAfter: handleDeleteAfterWithRollback,
    },
    mobile: useMobileSidebar(),
    desktopSidebarOpenState: useState(true),
    activeTabState: useState("story-state"),
    mobileSidebarTriggerRef: useRef<HTMLButtonElement | null>(null),
  };
}

function HomeLayout({ state }: { state: ReturnType<typeof useHomeState> }) {
  const { chat, conv, pipeline, stateHistory, mobile } = state;
  const [activeTab, setActiveTab] = state.activeTabState;
  const [desktopSidebarOpen, setDesktopSidebarOpen] =
    state.desktopSidebarOpenState;
  const { mobileSidebarTriggerRef } = state;
  const sidebar = (
    <HomeSidebarContent
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      conv={conv}
      recentlyUpdated={pipeline.recentlyUpdated}
      stateHistory={stateHistory}
      messages={chat.messages}
    />
  );
  return (
    <div className="app-shell safe-top">
      <MobileSidebarOverlay
        open={mobile.open}
        onClose={mobile.close}
        triggerRef={mobileSidebarTriggerRef}
      >
        {sidebar}
      </MobileSidebarOverlay>
      <ChatPane
        state={state}
        configSidebarOpen={desktopSidebarOpen}
        onToggleConfigSidebar={() => setDesktopSidebarOpen((open) => !open)}
        mobileSidebarTriggerRef={mobileSidebarTriggerRef}
      />
      <aside
        className={
          desktopSidebarOpen ? "app-sidebar w-125" : "app-sidebar-closed w-125"
        }
      >
        <div className="app-panel-header h-16 px-4">
          <h2 className="text-sm font-semibold">Configuration</h2>
          <Button
            variant="ghost"
            size="sm"
            className="app-button-square"
            title="Hide configuration"
            onClick={() => setDesktopSidebarOpen(false)}
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
        <div className="app-panel-body px-5 py-4">{sidebar}</div>
      </aside>
    </div>
  );
}

function ChatPane({
  state,
  configSidebarOpen,
  onToggleConfigSidebar,
  mobileSidebarTriggerRef,
}: {
  state: ReturnType<typeof useHomeState>;
  configSidebarOpen: boolean;
  onToggleConfigSidebar: () => void;
  mobileSidebarTriggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { chat, conv, pipeline, isLoading, msgActions, mobile } = state;
  const messages = chat.messages;

  return (
    <div className="app-chat-pane">
      <ChatHeader
        conv={conv}
        messages={messages}
        isLoading={isLoading}
        onTriggerPipeline={pipeline.triggerPipeline}
        configSidebarOpen={configSidebarOpen}
        onToggleConfigSidebar={onToggleConfigSidebar}
        onOpenMobileSidebar={mobile.toggle}
        mobileSidebarTriggerRef={mobileSidebarTriggerRef}
        onClearChat={msgActions.handleClearChat}
      />
      <div className="app-chat-main">
        <div className="app-chat-column">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            onEdit={msgActions.handleEditMessage}
            onDelete={msgActions.handleDeleteMessage}
            onDeleteAfter={msgActions.handleDeleteAfter}
            onRetry={msgActions.handleRetryMessage}
            onEditAndGenerate={msgActions.handleEditAndGenerate}
          />
          <ChatInput
            input={msgActions.input}
            onInputChange={msgActions.setInput}
            onSubmit={msgActions.handleSend}
            isLoading={isLoading}
            onStop={chat.stop}
          />
        </div>
      </div>
    </div>
  );
}

function MobileSidebarOverlay({
  open,
  onClose,
  triggerRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const trigger = triggerRef.current;

    const container = containerRef.current;
    const selector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = [
      ...container.querySelectorAll<HTMLElement>(selector),
    ].filter((el) => !el.hasAttribute("disabled"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      trapTabKey(event, focusable, first, last);
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;
  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal={true}
      aria-label="Configuration"
      className="app-mobile-overlay"
    >
      <div className="app-panel-header h-14 gap-2 px-4 safe-top">
        <Button
          variant="ghost"
          size="sm"
          className="app-button-square"
          aria-label="Back to chat"
          onClick={onClose}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">Configuration</h2>
      </div>
      <div className="app-panel-body px-4 py-4 safe-bottom safe-x">
        {children}
      </div>
    </div>
  );
}

function getLatestAssistantText(
  messages: ReturnType<typeof useChat>["messages"],
  lastScannedAssistantIdRef: React.MutableRefObject<string | null>,
): string | null {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (
    !lastAssistant ||
    lastScannedAssistantIdRef.current === lastAssistant.id
  ) {
    return null;
  }
  lastScannedAssistantIdRef.current = lastAssistant.id;

  const assistantText = lastAssistant.parts
    ?.filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();

  return assistantText || null;
}

function buildNextPresentEntityIds({
  assistantText,
  structuredState,
}: {
  assistantText: string;
  structuredState: NonNullable<
    ReturnType<typeof useConversationManager>["structuredState"]
  >;
}): string[] | null {
  const scene = structuredState.scene;
  const { addEntityIds, removeEntityIds } = scanPresenceFromAssistantMessage({
    assistantText,
    entities: structuredState.entities,
    currentPresentEntityIds: scene.presentEntityIds,
  });
  if (addEntityIds.length === 0 && removeEntityIds.length === 0) return null;

  const nextPresent = scene.presentEntityIds.filter(
    (entityId) => !removeEntityIds.includes(entityId),
  );
  for (const entityId of addEntityIds) {
    if (!nextPresent.includes(entityId)) nextPresent.push(entityId);
  }

  const unchanged =
    nextPresent.length === scene.presentEntityIds.length &&
    nextPresent.every(
      (entityId, index) => entityId === scene.presentEntityIds[index],
    );

  return unchanged ? null : nextPresent;
}

function useAssistantPresenceSync({
  isLoading,
  messages,
  structuredState,
  onStructuredStateUpdate,
}: {
  isLoading: boolean;
  messages: ReturnType<typeof useChat>["messages"];
  structuredState: ReturnType<typeof useConversationManager>["structuredState"];
  onStructuredStateUpdate: ReturnType<
    typeof useConversationManager
  >["handleStructuredStateUpdate"];
}) {
  const lastScannedAssistantIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !structuredState) return;

    const assistantText = getLatestAssistantText(
      messages,
      lastScannedAssistantIdRef,
    );
    if (!assistantText) return;

    const nextPresentEntityIds = buildNextPresentEntityIds({
      assistantText,
      structuredState,
    });
    if (!nextPresentEntityIds) return;

    onStructuredStateUpdate({
      ...structuredState,
      scene: {
        ...structuredState.scene,
        presentEntityIds: nextPresentEntityIds,
      },
    });
  }, [isLoading, messages, structuredState, onStructuredStateUpdate]);
}
