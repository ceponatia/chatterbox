import type { UIMessage } from "ai";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import {
  parseSystemPromptToSegments,
  segmentsToMarkdown,
} from "@chatterbox/prompt-assembly";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
  type Settings,
} from "./defaults";
import type { StructuredStoryState } from "./story-state-model";
import {
  parseMarkdownToStructured,
  emptyStructuredState,
  ensureLifecycleDefaults,
} from "./story-state-model";

export type { Settings };

// ---------------------------------------------------------------------------
// Conversation data model
// ---------------------------------------------------------------------------

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation extends ConversationMeta {
  messages: UIMessage[];
  storyProjectId: string | null;
  systemPrompt: string;
  storyState: string;
  previousStoryState: string | null;
  storyStateLastUpdated: string | null;
  settings: Settings;
  systemPromptBaseline: string | null;
  storyStateBaseline: string | null;
  /** Prompt assembly turn tracker: segment ID → last turn included */
  lastIncludedAt: Record<string, number>;
  /** User-customized prompt segments (parsed from imported system prompt). null = use defaults. */
  customSegments: SerializedSegment[] | null;
  /** Structured story state (parsed from markdown). null = legacy flat string mode. */
  structuredState: StructuredStoryState | null;
  /** Last user-turn number when summarization ran (persisted for cross-device consistency) */
  lastSummarizedTurn: number;
  /** Last user-turn number when state pipeline ran (persisted for cross-device consistency) */
  lastPipelineTurn: number;
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    // Never resolves -- page is navigating away
    return new Promise<T>(() => {});
  }
  if (!res.ok) {
    throw new Error(`Storage request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers (iOS Safari <15.4)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function listConversations(): Promise<ConversationMeta[]> {
  return requestJson<ConversationMeta[]>("/api/conversations");
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

function createConversationSnapshot(title = "New Chat"): Conversation {
  const now = new Date().toISOString();
  const segments = parseSystemPromptToSegments(DEFAULT_SYSTEM_PROMPT);
  return {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    storyProjectId: null,
    systemPrompt: segmentsToMarkdown(segments),
    storyState: "",
    previousStoryState: null,
    storyStateLastUpdated: null,
    settings: { ...DEFAULT_SETTINGS },
    systemPromptBaseline: DEFAULT_SYSTEM_PROMPT,
    storyStateBaseline: null,
    lastIncludedAt: {},
    customSegments: segments,
    structuredState: emptyStructuredState(),
    lastSummarizedTurn: 0,
    lastPipelineTurn: 0,
  };
}

export function createConversationDraft(title = "New Chat"): Conversation {
  return createConversationSnapshot(title);
}

/** Fill in turn-tracking fields that may be absent on older conversations. */
function applyTurnDefaults(conv: Conversation): void {
  const raw = conv as Partial<
    Pick<Conversation, "lastSummarizedTurn" | "lastPipelineTurn">
  >;
  if (raw.lastSummarizedTurn === undefined) conv.lastSummarizedTurn = 0;
  if (raw.lastPipelineTurn === undefined) conv.lastPipelineTurn = 0;
}

/** Apply defaults for fields added after a conversation was first created. */
function recoverMissingPromptAndState(conv: Conversation): void {
  if (conv.customSegments == null && conv.systemPrompt.trim()) {
    conv.customSegments = parseSystemPromptToSegments(conv.systemPrompt);
  }
  if (conv.structuredState == null && conv.storyState.trim()) {
    conv.structuredState = parseMarkdownToStructured(conv.storyState);
  }
}

function normalizeStructuredState(conv: Conversation): void {
  if (
    conv.structuredState &&
    "cast" in conv.structuredState &&
    !("entities" in conv.structuredState)
  ) {
    conv.structuredState = conv.storyState
      ? parseMarkdownToStructured(conv.storyState)
      : null;
  }
  if (conv.structuredState) {
    conv.structuredState = ensureLifecycleDefaults(conv.structuredState);
  }
}

function migrateConversation(conv: Conversation): Conversation {
  conv.settings = { ...DEFAULT_SETTINGS, ...conv.settings };
  if (conv.systemPromptBaseline === undefined) conv.systemPromptBaseline = null;
  if (conv.storyStateBaseline === undefined) conv.storyStateBaseline = null;
  if (!conv.lastIncludedAt) conv.lastIncludedAt = {};
  if (conv.customSegments === undefined) conv.customSegments = null;
  if (conv.structuredState === undefined) conv.structuredState = null;
  if (conv.storyProjectId === undefined) conv.storyProjectId = null;
  applyTurnDefaults(conv);
  recoverMissingPromptAndState(conv);
  normalizeStructuredState(conv);
  return conv;
}

export async function loadConversation(
  id: string,
): Promise<Conversation | null> {
  try {
    const conv = await requestJson<Conversation>(`/api/conversations/${id}`);
    return migrateConversation(conv);
  } catch {
    return null;
  }
}

export async function saveConversation(conv: Conversation) {
  conv.updatedAt = new Date().toISOString();
  await requestJson(`/api/conversations/${conv.id}`, {
    method: "PUT",
    body: JSON.stringify(conv),
  });
}

export async function deleteConversation(id: string) {
  await requestJson(`/api/conversations/${id}`, { method: "DELETE" });
}
