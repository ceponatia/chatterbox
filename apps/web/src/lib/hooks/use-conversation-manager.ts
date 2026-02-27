"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import {
  listConversations,
  loadConversation,
  saveConversation,
  createConversation,
  deleteConversation,
  getActiveConversationId,
  setActiveConversationId,
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
    (conv: Conversation) => {
      activeConvRef.current = conv;
      setActiveConvId(conv.id);
      setActiveConversationId(conv.id);
      setMessages(conv.messages);
      fields.setSystemPrompt(conv.systemPrompt);
      fields.setStoryState(conv.storyState);
      fields.setPreviousStoryState(conv.previousStoryState);
      fields.setStoryStateLastUpdated(conv.storyStateLastUpdated);
      fields.setSettings(conv.settings);
      fields.setSystemPromptBaseline(conv.systemPromptBaseline);
      fields.setStoryStateBaseline(conv.storyStateBaseline);
      fields.setLastIncludedAt(conv.lastIncludedAt ?? {});
      fields.setCustomSegments(conv.customSegments ?? null);
      fields.setStructuredState(conv.structuredState ?? null);
      fields.setLastSummarizedTurn(conv.lastSummarizedTurn ?? 0);
      fields.setLastPipelineTurn(conv.lastPipelineTurn ?? 0);
      onConfigSync({
        systemPrompt: conv.systemPrompt,
        storyState: conv.storyState,
        settings: conv.settings,
        customSegments: conv.customSegments,
      });
    },
    [setMessages, fields, onConfigSync],
  );

  useHydrateOnMount(hydrateConversation, setConversations);
  useAutoSave(
    activeConvRef,
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

  // Wrap import handlers to immediately sync liveConfig (not just via deferred useEffect)
  const handleSystemPromptImport = useCallback((content: string) => {
    fieldsRef.current.handleSystemPromptImport(content);
    const f = fieldsRef.current;
    // Sync the parsed/assembled markdown, not the raw import
    syncRef.current({
      systemPrompt: f.systemPrompt,
      storyState: f.storyState,
      settings: f.settings,
      customSegments: f.customSegments,
    });
  }, []);

  const handleStoryStateImport = useCallback((content: string) => {
    fieldsRef.current.handleStoryStateImport(content);
    const f = fieldsRef.current;
    syncRef.current({
      systemPrompt: f.systemPrompt,
      storyState: content,
      settings: f.settings,
    });
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === activeConvId) {
        setConvDrawerOpen(false);
        return;
      }
      void (async () => {
        const conv = await loadConversation(id);
        if (!conv) return;
        onConversationSwitch?.();
        hydrateConversation(conv);
        setConvDrawerOpen(false);
      })();
    },
    [activeConvId, hydrateConversation, onConversationSwitch],
  );

  const handleNewConversation = useCallback(() => {
    void (async () => {
      onConversationSwitch?.();
      const conv = await createConversation();
      hydrateConversation(conv);
      setConversations(await listConversations());
      setConvDrawerOpen(false);
    })();
  }, [hydrateConversation, onConversationSwitch]);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      void (async () => {
        await deleteConversation(id);
        const remaining = await listConversations();
        setConversations(remaining);
        if (id !== activeConvId) return;
        const first = remaining[0];
        const next = first ? await loadConversation(first.id) : null;
        const fallback = next ?? (await createConversation());
        hydrateConversation(fallback);
        if (!next) setConversations(await listConversations());
      })();
    },
    [activeConvId, hydrateConversation],
  );

  return {
    conversations,
    activeConvId,
    convDrawerOpen,
    setConvDrawerOpen,
    ...fields,
    ...syncStatus,
    handleSystemPromptImport,
    handleStoryStateImport,
    handleSelectConversation,
    handleNewConversation,
    handleDeleteConversation,
  };
}

// ---------------------------------------------------------------------------
// Side-effect hooks extracted to keep useConversationManager under 100 lines
// ---------------------------------------------------------------------------

function useHydrateOnMount(
  hydrateConversation: (conv: Conversation) => void,
  setConversations: (c: ConversationMeta[]) => void,
) {
  useEffect(() => {
    let active = true;
    const init = async () => {
      const index = await listConversations();
      if (!active) return;
      setConversations(index);
      const savedId = getActiveConversationId();
      let conv: Conversation | null = null;
      if (savedId) conv = await loadConversation(savedId);
      const firstIdx = index[0];
      if (!conv && firstIdx) conv = await loadConversation(firstIdx.id);
      if (!conv) conv = await createConversation();
      if (!active) return;
      hydrateConversation(conv);
      setConversations(await listConversations());
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      active = false;
    };
  }, []);
}

function useAutoSave(
  activeConvRef: React.RefObject<Conversation | null>,
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
  } = fields;

  // Track previous values to detect which field actually changed
  const prevStoryRef = useRef(storyState);
  const prevPromptRef = useRef(systemPrompt);

  // Track conversation switches — skip save when ID just changed because
  // React state still holds stale values from the previous conversation.
  // The new conversation was already persisted by createConversation().
  const prevConvIdRef = useRef(activeConvId);

  useEffect(() => {
    if (!activeConvRef.current || !activeConvId) return;

    // Conversation just switched — skip this save cycle.
    // React state setters are batched, so field values are still stale.
    if (prevConvIdRef.current !== activeConvId) {
      prevConvIdRef.current = activeConvId;
      prevStoryRef.current = storyState;
      prevPromptRef.current = systemPrompt;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      return;
    }

    // Mark the specific field(s) that changed as pending
    if (storyState !== prevStoryRef.current) onStoryPending();
    if (systemPrompt !== prevPromptRef.current) onPromptPending();
    prevStoryRef.current = storyState;
    prevPromptRef.current = systemPrompt;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void (async () => {
        const conv = activeConvRef.current;
        if (!conv) return;
        Object.assign(conv, {
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
        });
        await saveConversation(conv);
        setConversations(await listConversations());
        onSaved();
      })();
    }, 500);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
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
    setConversations,
    onSaved,
    onStoryPending,
    onPromptPending,
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
      await saveConversation(conv);
      setConversations(await listConversations());
    })();
  }, [messages, activeConvRef, setConversations]);
}
