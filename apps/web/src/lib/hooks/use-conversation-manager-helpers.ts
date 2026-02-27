"use client";

import { useCallback, useEffect, useRef } from "react";
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

interface ConfigSync {
  (config: {
    systemPrompt: string;
    storyState: string;
    settings: Settings;
    customSegments?: SerializedSegment[] | null;
    presentEntityIds?: string[];
  }): void;
}

export function hydrateFields(
  f: ReturnType<typeof useFieldSetters>,
  conv: Conversation,
) {
  hydrateCoreFields(f, conv);
  hydratePromptAssemblyFields(f, conv);
  hydratePipelineFields(f, conv);
}

function hydrateCoreFields(
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
}

function hydratePromptAssemblyFields(
  f: ReturnType<typeof useFieldSetters>,
  conv: Conversation,
) {
  f.setLastIncludedAt(withDefault(conv.lastIncludedAt, {}));
  f.setCustomSegments(withDefault(conv.customSegments, null));
  f.setStructuredState(withDefault(conv.structuredState, null));
}

function hydratePipelineFields(
  f: ReturnType<typeof useFieldSetters>,
  conv: Conversation,
) {
  f.setLastSummarizedTurn(withDefault(conv.lastSummarizedTurn, 0));
  f.setLastPipelineTurn(withDefault(conv.lastPipelineTurn, 0));
}

function withDefault<T>(value: T | null | undefined, fallback: T): T {
  return value == null ? fallback : value;
}

const ACTIVE_CONV_KEY = "chatterbox_active_conv_id";

export function persistActiveConvId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(ACTIVE_CONV_KEY, id);
    else sessionStorage.removeItem(ACTIVE_CONV_KEY);
  } catch {
    // SSR or private browsing — ignore
  }
}

function readPersistedConvId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_CONV_KEY);
  } catch {
    return null;
  }
}

export function useHydrateOnMount(
  hydrateConversation: (conv: Conversation, persisted: boolean) => void,
  setConversations: (c: ConversationMeta[]) => void,
) {
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const index = await listConversations();
        if (!active) return;
        setConversations(index);

        const savedId = readPersistedConvId();
        if (savedId) {
          const saved = await loadConversation(savedId);
          if (saved && active) {
            hydrateConversation(saved, true);
            return;
          }
        }

        const conv = createConversationDraft();
        if (!active) return;
        hydrateConversation(conv, false);
      } catch (err) {
        console.error("Failed to initialize conversation manager:", err);
      }
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

function buildSnapshot(
  messages: UIMessage[],
  fields: {
    systemPrompt: string;
    storyState: string;
    previousStoryState: string | null;
    storyStateLastUpdated: string | null;
    settings: ReturnType<typeof useFieldSetters>["settings"];
    systemPromptBaseline: string | null;
    storyStateBaseline: string | null;
    lastIncludedAt: Record<string, number>;
    customSegments: ReturnType<typeof useFieldSetters>["customSegments"];
    structuredState: ReturnType<typeof useFieldSetters>["structuredState"];
    lastSummarizedTurn: number;
    lastPipelineTurn: number;
  },
): Partial<Conversation> {
  return {
    messages,
    systemPrompt: fields.systemPrompt,
    storyState: fields.storyState,
    previousStoryState: fields.previousStoryState,
    storyStateLastUpdated: fields.storyStateLastUpdated,
    settings: fields.settings,
    systemPromptBaseline: fields.systemPromptBaseline,
    storyStateBaseline: fields.storyStateBaseline,
    lastIncludedAt: fields.lastIncludedAt,
    customSegments: fields.customSegments,
    structuredState: fields.structuredState,
    lastSummarizedTurn: fields.lastSummarizedTurn,
    lastPipelineTurn: fields.lastPipelineTurn,
  };
}

function schedulePersist(
  saveTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
  saveDelayMs: number,
  activeConvRef: React.RefObject<Conversation | null>,
  activeConvPersistedRef: React.RefObject<boolean>,
  snapshot: Partial<Conversation>,
  setConversations: (c: ConversationMeta[]) => void,
  onSaved: () => void,
) {
  clearSaveTimeout(saveTimeoutRef);
  saveTimeoutRef.current = setTimeout(() => {
    void persistSnapshot(
      activeConvRef,
      activeConvPersistedRef,
      snapshot,
      setConversations,
      onSaved,
    ).catch((err) => {
      console.error("Failed to persist conversation snapshot:", err);
    });
  }, saveDelayMs);
}

interface RunAutoSaveArgs {
  activeConvRef: React.RefObject<Conversation | null>;
  activeConvId: string | null;
  prevConvIdRef: React.RefObject<string | null>;
  storyState: string;
  systemPrompt: string;
  prevStoryRef: React.RefObject<string>;
  prevPromptRef: React.RefObject<string>;
  saveTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  activeConvPersistedRef: React.RefObject<boolean>;
  storyStateTouched: boolean;
  systemPromptTouched: boolean;
  messages: UIMessage[];
  previousStoryState: string | null;
  storyStateLastUpdated: string | null;
  settings: ReturnType<typeof useFieldSetters>["settings"];
  systemPromptBaseline: string | null;
  storyStateBaseline: string | null;
  lastIncludedAt: Record<string, number>;
  customSegments: ReturnType<typeof useFieldSetters>["customSegments"];
  structuredState: ReturnType<typeof useFieldSetters>["structuredState"];
  lastSummarizedTurn: number;
  lastPipelineTurn: number;
  onStoryPending: () => void;
  onPromptPending: () => void;
  setConversations: (c: ConversationMeta[]) => void;
  onSaved: () => void;
}

function runAutoSaveCycle(args: RunAutoSaveArgs): boolean {
  if (!args.activeConvRef.current || !args.activeConvId) return false;
  if (
    handleConvSwitch(
      args.prevConvIdRef,
      args.activeConvId,
      args.storyState,
      args.systemPrompt,
      args.prevStoryRef,
      args.prevPromptRef,
      args.saveTimeoutRef,
    )
  ) {
    return false;
  }
  if (
    shouldSkipSave(
      args.activeConvPersistedRef.current,
      args.storyStateTouched,
      args.systemPromptTouched,
      args.messages,
    )
  ) {
    return false;
  }

  markDirtyFields(
    args.storyState,
    args.prevStoryRef,
    args.onStoryPending,
    args.systemPrompt,
    args.prevPromptRef,
    args.onPromptPending,
  );

  const saveDelayMs = args.activeConvPersistedRef.current ? 500 : 0;
  const snapshot = buildSnapshot(args.messages, {
    systemPrompt: args.systemPrompt,
    storyState: args.storyState,
    previousStoryState: args.previousStoryState,
    storyStateLastUpdated: args.storyStateLastUpdated,
    settings: args.settings,
    systemPromptBaseline: args.systemPromptBaseline,
    storyStateBaseline: args.storyStateBaseline,
    lastIncludedAt: args.lastIncludedAt,
    customSegments: args.customSegments,
    structuredState: args.structuredState,
    lastSummarizedTurn: args.lastSummarizedTurn,
    lastPipelineTurn: args.lastPipelineTurn,
  });
  schedulePersist(
    args.saveTimeoutRef,
    saveDelayMs,
    args.activeConvRef,
    args.activeConvPersistedRef,
    snapshot,
    args.setConversations,
    args.onSaved,
  );
  return true;
}

function buildRunAutoSaveArgs(
  activeConvRef: React.RefObject<Conversation | null>,
  activeConvPersistedRef: React.RefObject<boolean>,
  activeConvId: string | null,
  prevConvIdRef: React.RefObject<string | null>,
  prevStoryRef: React.RefObject<string>,
  prevPromptRef: React.RefObject<string>,
  saveTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
  messages: UIMessage[],
  fields: ReturnType<typeof useFieldSetters>,
  onStoryPending: () => void,
  onPromptPending: () => void,
  setConversations: (c: ConversationMeta[]) => void,
  onSaved: () => void,
): RunAutoSaveArgs {
  return {
    activeConvRef,
    activeConvId,
    prevConvIdRef,
    storyState: fields.storyState,
    systemPrompt: fields.systemPrompt,
    prevStoryRef,
    prevPromptRef,
    saveTimeoutRef,
    activeConvPersistedRef,
    storyStateTouched: fields.storyStateTouched,
    systemPromptTouched: fields.systemPromptTouched,
    messages,
    previousStoryState: fields.previousStoryState,
    storyStateLastUpdated: fields.storyStateLastUpdated,
    settings: fields.settings,
    systemPromptBaseline: fields.systemPromptBaseline,
    storyStateBaseline: fields.storyStateBaseline,
    lastIncludedAt: fields.lastIncludedAt,
    customSegments: fields.customSegments,
    structuredState: fields.structuredState,
    lastSummarizedTurn: fields.lastSummarizedTurn,
    lastPipelineTurn: fields.lastPipelineTurn,
    onStoryPending,
    onPromptPending,
    setConversations,
    onSaved,
  };
}

export function useAutoSave(
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
  const prevStoryRef = useRef(fields.storyState);
  const prevPromptRef = useRef(fields.systemPrompt);
  const prevConvIdRef = useRef(activeConvId);

  useEffect(() => {
    const args = buildRunAutoSaveArgs(
      activeConvRef,
      activeConvPersistedRef,
      activeConvId,
      prevConvIdRef,
      prevStoryRef,
      prevPromptRef,
      saveTimeoutRef,
      messages,
      fields,
      onStoryPending,
      onPromptPending,
      setConversations,
      onSaved,
    );
    const scheduled = runAutoSaveCycle(args);
    if (!scheduled) return;
    return () => clearSaveTimeout(saveTimeoutRef);
    // `fields` is read in the effect body but intentionally excluded from deps
    // to avoid re-firing on every render (new object identity each time).
    // Individual field values that affect save decisions are listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    messages,
    fields.systemPrompt,
    fields.storyState,
    fields.settings,
    fields.customSegments,
    fields.structuredState,
    fields.lastIncludedAt,
    fields.lastPipelineTurn,
    fields.lastSummarizedTurn,
    activeConvId,
    activeConvRef,
    activeConvPersistedRef,
    setConversations,
    onSaved,
    onStoryPending,
    onPromptPending,
  ]);
}

export function useAutoTitle(
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

export function useConversationActions(
  activeConvId: string | null,
  hydrateConversation: (conv: Conversation, persisted: boolean) => void,
  fieldsRef: React.RefObject<ReturnType<typeof useFieldSetters>>,
  syncRef: React.RefObject<ConfigSync>,
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
