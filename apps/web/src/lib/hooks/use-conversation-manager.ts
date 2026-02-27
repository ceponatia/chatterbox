"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import {
  listConversations,
  loadConversation,
  saveConversation,
  createConversationDraft,
  deleteConversation,
  type Conversation,
  type ConversationMeta,
} from "@/lib/storage";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import type { Settings } from "@/lib/defaults";
import { useFieldSetters } from "./use-field-setters";
import { useSyncStatus } from "./use-sync-status";

interface Params {
  messages: UIMessage[];
  setMessages: (messages: UIMessage[]) => void;
  onConfigSync: (config: {
    systemPrompt: string;
    storyState: string;
    settings: Settings;
    customSegments?: SerializedSegment[] | null;
  }) => void;
  onConversationSwitch?: () => void;
}

export function useConversationManager({
  messages,
  setMessages,
  onConfigSync,
  onConversationSwitch,
}: Params) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [convDrawerOpen, setConvDrawerOpen] = useState(false);
  const activeConvRef = useRef<Conversation | null>(null);
  const activeConvPersistedRef = useRef(false);

  const fields = useFieldSetters();
  const syncStatus = useSyncStatus();

  // Keep refs so callbacks always reach the latest sync function / field values
  const syncRef = useRef(onConfigSync);
  const fieldsRef = useRef(fields);
  useEffect(() => {
    syncRef.current = onConfigSync;
  }, [onConfigSync]);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const hydrateConversation = useCallback(
    (conv: Conversation, persisted: boolean) => {
      activeConvRef.current = conv;
      activeConvPersistedRef.current = persisted;
      setActiveConvId(conv.id);
      setMessages(conv.messages);
      hydrateFields(fieldsRef.current, conv);
      syncRef.current({
        systemPrompt: conv.systemPrompt,
        storyState: conv.storyState,
        settings: conv.settings,
        customSegments: conv.customSegments,
      });
    },
    [setMessages],
  );

  useHydrateOnMount(hydrateConversation, setConversations);
  useAutoSave(
    activeConvRef,
    activeConvPersistedRef,
    activeConvId,
    messages,
    fields,
    setConversations,
    syncStatus.markAllSaved,
    syncStatus.markStoryStatePending,
    syncStatus.markSystemPromptPending,
  );
  useAutoTitle(activeConvRef, messages, setConversations);

  useEffect(() => {
    onConfigSync({
      systemPrompt: fields.systemPrompt,
      storyState: fields.storyState,
      settings: fields.settings,
      customSegments: fields.customSegments,
    });
  }, [
    fields.systemPrompt,
    fields.storyState,
    fields.settings,
    fields.customSegments,
    onConfigSync,
  ]);

  const actions = useConversationActions(
    activeConvId,
    hydrateConversation,
    fieldsRef,
    syncRef,
    setConvDrawerOpen,
    setConversations,
    onConversationSwitch,
  );

  return {
    conversations,
    activeConvId,
    convDrawerOpen,
    setConvDrawerOpen,
    ...fields,
    ...syncStatus,
    ...actions,
  };
}

// ---------------------------------------------------------------------------
// Side-effect hooks extracted to keep useConversationManager under 100 lines
// ---------------------------------------------------------------------------

function hydrateFields(
  f: ReturnType<typeof useFieldSetters>,
  conv: Conversation,
) {
  f.resetInputTouchFlags();
  f.setSystemPrompt(conv.systemPrompt);
  f.setStoryState(conv.storyState);
  f.setPreviousStoryState(conv.previousStoryState);
  f.setStoryStateLastUpdated(conv.storyStateLastUpdated);
  f.setSettings(conv.settings);
  f.setSystemPromptBaseline(conv.systemPromptBaseline);
  f.setStoryStateBaseline(conv.storyStateBaseline);
  f.setLastIncludedAt(conv.lastIncludedAt ?? {});
  f.setCustomSegments(conv.customSegments ?? null);
  f.setStructuredState(conv.structuredState ?? null);
  f.setLastSummarizedTurn(conv.lastSummarizedTurn ?? 0);
  f.setLastPipelineTurn(conv.lastPipelineTurn ?? 0);
}

function useHydrateOnMount(
  hydrateConversation: (conv: Conversation, persisted: boolean) => void,
  setConversations: (c: ConversationMeta[]) => void,
) {
  useEffect(() => {
    let active = true;
    const init = async () => {
      // Landing guard: always boot into a fresh empty conversation.
      // Do not auto-load any existing conversation on startup.
      const index = await listConversations();
      if (!active) return;
      setConversations(index);
      const conv = createConversationDraft();
      if (!active) return;
      hydrateConversation(conv, false);
    };
    void init();
    return () => {
      active = false;
    };
  }, [hydrateConversation, setConversations]);
}

function clearSaveTimeout(
  ref: React.RefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (ref.current != null) clearTimeout(ref.current);
}

/** Returns true if the save cycle should be skipped (conversation just switched). */
function handleConvSwitch(
  prevConvIdRef: React.RefObject<string | null>,
  activeConvId: string,
  storyState: string,
  systemPrompt: string,
  prevStoryRef: React.RefObject<string>,
  prevPromptRef: React.RefObject<string>,
  saveTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
): boolean {
  if (prevConvIdRef.current === activeConvId) return false;
  prevConvIdRef.current = activeConvId;
  prevStoryRef.current = storyState;
  prevPromptRef.current = systemPrompt;
  clearSaveTimeout(saveTimeoutRef);
  return true;
}

/** Returns true if an unpersisted draft has no user-facing changes worth saving. */
function shouldSkipSave(
  isPersisted: boolean,
  storyStateTouched: boolean,
  systemPromptTouched: boolean,
  messages: UIMessage[],
): boolean {
  if (isPersisted) return false;
  return (
    !storyStateTouched &&
    !systemPromptTouched &&
    !messages.some((m) => m.role === "user")
  );
}

/** Mark story-state / system-prompt as pending if changed, update tracking refs. */
function markDirtyFields(
  storyState: string,
  prevStoryRef: React.RefObject<string>,
  onStoryPending: () => void,
  systemPrompt: string,
  prevPromptRef: React.RefObject<string>,
  onPromptPending: () => void,
) {
  if (storyState !== prevStoryRef.current) onStoryPending();
  if (systemPrompt !== prevPromptRef.current) onPromptPending();
  prevStoryRef.current = storyState;
  prevPromptRef.current = systemPrompt;
}

async function persistSnapshot(
  activeConvRef: React.RefObject<Conversation | null>,
  activeConvPersistedRef: React.RefObject<boolean>,
  snapshot: Partial<Conversation>,
  setConversations: (c: ConversationMeta[]) => void,
  onSaved: () => void,
) {
  const conv = activeConvRef.current;
  if (!conv) return;
  Object.assign(conv, snapshot);
  await saveConversation(conv);
  activeConvPersistedRef.current = true;
  setConversations(await listConversations());
  onSaved();
}

function useAutoSave(
  activeConvRef: React.RefObject<Conversation | null>,
  activeConvPersistedRef: React.RefObject<boolean>,
  activeConvId: string | null,
  messages: UIMessage[],
  fields: ReturnType<typeof useFieldSetters>,
  setConversations: (c: ConversationMeta[]) => void,
  onSaved: () => void,
  onStoryPending: () => void,
  onPromptPending: () => void,
) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    systemPrompt,
    storyState,
    previousStoryState,
    storyStateLastUpdated,
    settings,
    systemPromptBaseline,
    storyStateBaseline,
    lastIncludedAt,
    customSegments,
    structuredState,
    lastSummarizedTurn,
    lastPipelineTurn,
    storyStateTouched,
    systemPromptTouched,
  } = fields;

  const prevStoryRef = useRef(storyState);
  const prevPromptRef = useRef(systemPrompt);
  const prevConvIdRef = useRef(activeConvId);

  useEffect(() => {
    if (!activeConvRef.current || !activeConvId) return;
    if (
      handleConvSwitch(
        prevConvIdRef,
        activeConvId,
        storyState,
        systemPrompt,
        prevStoryRef,
        prevPromptRef,
        saveTimeoutRef,
      )
    )
      return;
    if (
      shouldSkipSave(
        activeConvPersistedRef.current,
        storyStateTouched,
        systemPromptTouched,
        messages,
      )
    )
      return;
    markDirtyFields(
      storyState,
      prevStoryRef,
      onStoryPending,
      systemPrompt,
      prevPromptRef,
      onPromptPending,
    );

    const saveDelayMs = activeConvPersistedRef.current ? 500 : 0;
    clearSaveTimeout(saveTimeoutRef);
    const snapshot = {
      messages,
      systemPrompt,
      storyState,
      previousStoryState,
      storyStateLastUpdated,
      settings,
      systemPromptBaseline,
      storyStateBaseline,
      lastIncludedAt,
      customSegments,
      structuredState,
      lastSummarizedTurn,
      lastPipelineTurn,
    };
    saveTimeoutRef.current = setTimeout(() => {
      void persistSnapshot(
        activeConvRef,
        activeConvPersistedRef,
        snapshot,
        setConversations,
        onSaved,
      );
    }, saveDelayMs);
    return () => clearSaveTimeout(saveTimeoutRef);
  }, [
    messages,
    systemPrompt,
    storyState,
    previousStoryState,
    storyStateLastUpdated,
    settings,
    systemPromptBaseline,
    storyStateBaseline,
    lastIncludedAt,
    customSegments,
    structuredState,
    lastSummarizedTurn,
    lastPipelineTurn,
    activeConvId,
    activeConvRef,
    activeConvPersistedRef,
    setConversations,
    onSaved,
    onStoryPending,
    onPromptPending,
    storyStateTouched,
    systemPromptTouched,
  ]);
}

function useAutoTitle(
  activeConvRef: React.RefObject<Conversation | null>,
  messages: UIMessage[],
  setConversations: (c: ConversationMeta[]) => void,
) {
  useEffect(() => {
    if (!activeConvRef.current) return;
    const conv = activeConvRef.current;
    if (conv.title !== "New Chat") return;
    const firstUser = messages.find((m) => m.role === "user");
    if (!firstUser) return;
    const text = firstUser.parts?.find((p) => p.type === "text");
    if (!text || text.type !== "text") return;
    const title = text.text.slice(0, 60) + (text.text.length > 60 ? "…" : "");
    conv.title = title;
    void (async () => {
      try {
        await saveConversation(conv);
        setConversations(await listConversations());
      } catch (err) {
        console.error("Failed to auto-title conversation:", err);
      }
    })();
  }, [messages, activeConvRef, setConversations]);
}

function useConversationActions(
  activeConvId: string | null,
  hydrateConversation: (conv: Conversation, persisted: boolean) => void,
  fieldsRef: React.RefObject<ReturnType<typeof useFieldSetters>>,
  syncRef: React.RefObject<Params["onConfigSync"]>,
  setConvDrawerOpen: (open: boolean) => void,
  setConversations: (c: ConversationMeta[]) => void,
  onConversationSwitch?: () => void,
) {
  const handleSystemPromptImport = useCallback(
    (content: string) => {
      fieldsRef.current.handleSystemPromptImport(content);
      const f = fieldsRef.current;
      syncRef.current({
        systemPrompt: f.systemPrompt,
        storyState: f.storyState,
        settings: f.settings,
        customSegments: f.customSegments,
      });
    },
    [fieldsRef, syncRef],
  );

  const handleStoryStateImport = useCallback(
    (content: string) => {
      fieldsRef.current.handleStoryStateImport(content);
      const f = fieldsRef.current;
      syncRef.current({
        systemPrompt: f.systemPrompt,
        storyState: content,
        settings: f.settings,
      });
    },
    [fieldsRef, syncRef],
  );

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === activeConvId) {
        setConvDrawerOpen(false);
        return;
      }
      void (async () => {
        try {
          const conv = await loadConversation(id);
          if (!conv) return;
          onConversationSwitch?.();
          hydrateConversation(conv, true);
          setConvDrawerOpen(false);
        } catch (err) {
          console.error("Failed to load conversation:", err);
        }
      })();
    },
    [
      activeConvId,
      hydrateConversation,
      onConversationSwitch,
      setConvDrawerOpen,
    ],
  );

  const handleNewConversation = useCallback(() => {
    onConversationSwitch?.();
    const conv = createConversationDraft();
    hydrateConversation(conv, false);
    setConvDrawerOpen(false);
  }, [hydrateConversation, onConversationSwitch, setConvDrawerOpen]);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      void (async () => {
        try {
          await deleteConversation(id);
          const remaining = await listConversations();
          setConversations(remaining);
          if (id !== activeConvId) return;
          const fallback = createConversationDraft();
          hydrateConversation(fallback, false);
        } catch (err) {
          console.error("Failed to delete conversation:", err);
        }
      })();
    },
    [activeConvId, hydrateConversation, setConversations],
  );

  return {
    handleSystemPromptImport,
    handleStoryStateImport,
    handleSelectConversation,
    handleNewConversation,
    handleDeleteConversation,
  };
}
