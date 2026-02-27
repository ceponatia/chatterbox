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

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const INDEX_KEY = "chatterbox-conversations";
const ACTIVE_KEY = "chatterbox-active-conversation";
const convKey = (id: string) => `chatterbox-conv-${id}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

const useRemoteStorage =
  process.env.NEXT_PUBLIC_LOCAL_STORAGE_DISABLED === "true";

const memoryStore = new Map<string, string>();
let localStorageAvailable: boolean | null = null;

function hasLocalStorage(): boolean {
  if (!isBrowser()) return false;
  if (useRemoteStorage) return false;
  if (localStorageAvailable !== null) return localStorageAvailable;
  try {
    const probeKey = "__chatterbox_storage_probe__";
    localStorage.setItem(probeKey, "1");
    localStorage.removeItem(probeKey);
    localStorageAvailable = true;
  } catch {
    localStorageAvailable = false;
  }
  return localStorageAvailable;
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Storage request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Safe storage wrapper — falls back to in-memory if localStorage is blocked. */
export const safeStorage = {
  getItem(key: string): string | null {
    if (hasLocalStorage()) {
      try {
        return localStorage.getItem(key);
      } catch {
        localStorageAvailable = false;
      }
    }
    return memoryStore.get(key) ?? null;
  },
  setItem(key: string, value: string): boolean {
    if (hasLocalStorage()) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        localStorageAvailable = false;
      }
    }
    memoryStore.set(key, value);
    return true;
  },
  removeItem(key: string): boolean {
    if (hasLocalStorage()) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch {
        localStorageAvailable = false;
      }
    }
    memoryStore.delete(key);
    return true;
  },
};

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

// ---------------------------------------------------------------------------
// Index (lightweight list of ConversationMeta)
// ---------------------------------------------------------------------------

function listConversationsLocal(): ConversationMeta[] {
  if (!isBrowser()) return [];
  const raw = safeStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ConversationMeta[];
  } catch {
    return [];
  }
}

function saveIndex(index: ConversationMeta[]) {
  safeStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export async function listConversations(): Promise<ConversationMeta[]> {
  if (!useRemoteStorage) return listConversationsLocal();
  return requestJson<ConversationMeta[]>("/api/conversations");
}

// ---------------------------------------------------------------------------
// Active conversation ID
// ---------------------------------------------------------------------------

export function getActiveConversationId(): string | null {
  if (!isBrowser()) return null;
  return safeStorage.getItem(ACTIVE_KEY);
}

export function setActiveConversationId(id: string) {
  safeStorage.setItem(ACTIVE_KEY, id);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

function createConversationLocal(title = "New Chat"): Conversation {
  const now = new Date().toISOString();
  const segments = parseSystemPromptToSegments(DEFAULT_SYSTEM_PROMPT);
  const conv: Conversation = {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
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
  // Persist full blob
  safeStorage.setItem(convKey(conv.id), JSON.stringify(conv));
  // Update index
  const index = listConversationsLocal();
  index.unshift({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  });
  saveIndex(index);
  // Set as active
  setActiveConversationId(conv.id);
  return conv;
}

export async function createConversation(
  title = "New Chat",
): Promise<Conversation> {
  if (!useRemoteStorage) return createConversationLocal(title);
  const now = new Date().toISOString();
  const segments = parseSystemPromptToSegments(DEFAULT_SYSTEM_PROMPT);
  const conv: Conversation = {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
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
  await requestJson(`/api/conversations/${conv.id}`, {
    method: "PUT",
    body: JSON.stringify(conv),
  });
  setActiveConversationId(conv.id);
  return conv;
}

/** Fill in turn-tracking fields that may be absent on older conversations. */
function applyTurnDefaults(conv: Conversation): void {
  const raw = conv as Partial<Pick<Conversation, "lastSummarizedTurn" | "lastPipelineTurn">>;
  if (raw.lastSummarizedTurn === undefined) conv.lastSummarizedTurn = 0;
  if (raw.lastPipelineTurn === undefined) conv.lastPipelineTurn = 0;
}

/** Apply defaults for fields added after a conversation was first created. */
function migrateConversation(conv: Conversation): Conversation {
  conv.settings = { ...DEFAULT_SETTINGS, ...conv.settings };
  if (conv.systemPromptBaseline === undefined) conv.systemPromptBaseline = null;
  if (conv.storyStateBaseline === undefined) conv.storyStateBaseline = null;
  if (!conv.lastIncludedAt) conv.lastIncludedAt = {};
  if (conv.customSegments === undefined) conv.customSegments = null;
  if (conv.structuredState === undefined) conv.structuredState = null;
  applyTurnDefaults(conv);
  // Migrate old cast-based structuredState (IM03) → entity-based (IM04)
  if (
    conv.structuredState &&
    "cast" in conv.structuredState &&
    !("entities" in conv.structuredState)
  ) {
    conv.structuredState = conv.storyState
      ? parseMarkdownToStructured(conv.storyState)
      : null;
  }
  return conv;
}

function loadConversationLocal(id: string): Conversation | null {
  if (!isBrowser()) return null;
  const raw = safeStorage.getItem(convKey(id));
  if (!raw) return null;
  try {
    return migrateConversation(JSON.parse(raw) as Conversation);
  } catch {
    return null;
  }
}

export async function loadConversation(
  id: string,
): Promise<Conversation | null> {
  if (!useRemoteStorage) return loadConversationLocal(id);
  try {
    const conv = await requestJson<Conversation>(`/api/conversations/${id}`);
    return migrateConversation(conv);
  } catch {
    return null;
  }
}

function saveConversationLocal(conv: Conversation) {
  conv.updatedAt = new Date().toISOString();
  safeStorage.setItem(convKey(conv.id), JSON.stringify(conv));
  // Keep index in sync
  const index = listConversationsLocal();
  const idx = index.findIndex((c) => c.id === conv.id);
  const meta: ConversationMeta = {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
  if (idx >= 0) {
    index[idx] = meta;
  } else {
    index.unshift(meta);
  }
  saveIndex(index);
}

export async function saveConversation(conv: Conversation) {
  conv.updatedAt = new Date().toISOString();
  if (!useRemoteStorage) {
    saveConversationLocal(conv);
    return;
  }
  await requestJson(`/api/conversations/${conv.id}`, {
    method: "PUT",
    body: JSON.stringify(conv),
  });
}

function deleteConversationLocal(id: string) {
  safeStorage.removeItem(convKey(id));
  const index = listConversationsLocal().filter((c) => c.id !== id);
  saveIndex(index);
  // If deleted was active, clear active
  if (getActiveConversationId() === id) {
    safeStorage.removeItem(ACTIVE_KEY);
  }
}

export async function deleteConversation(id: string) {
  if (!useRemoteStorage) {
    deleteConversationLocal(id);
    return;
  }
  await requestJson(`/api/conversations/${id}`, { method: "DELETE" });
  if (getActiveConversationId() === id) {
    safeStorage.removeItem(ACTIVE_KEY);
  }
}

export async function renameConversation(id: string, title: string) {
  const conv = await loadConversation(id);
  if (!conv) return;
  conv.title = title;
  await saveConversation(conv);
}
