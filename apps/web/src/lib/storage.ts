import type { UIMessage } from "ai";
import { DEFAULT_SETTINGS, type Settings } from "./defaults";

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

function generateId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Index (lightweight list of ConversationMeta)
// ---------------------------------------------------------------------------

export function listConversations(): ConversationMeta[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as ConversationMeta[]) : [];
  } catch {
    return [];
  }
}

function saveIndex(index: ConversationMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

// ---------------------------------------------------------------------------
// Active conversation ID
// ---------------------------------------------------------------------------

export function getActiveConversationId(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveConversationId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function createConversation(title = "New Chat"): Conversation {
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    systemPrompt: "",
    storyState: "",
    previousStoryState: null,
    storyStateLastUpdated: null,
    settings: { ...DEFAULT_SETTINGS },
    systemPromptBaseline: null,
    storyStateBaseline: null,
    lastIncludedAt: {},
  };
  // Persist full blob
  localStorage.setItem(convKey(conv.id), JSON.stringify(conv));
  // Update index
  const index = listConversations();
  index.unshift({ id: conv.id, title: conv.title, createdAt: conv.createdAt, updatedAt: conv.updatedAt });
  saveIndex(index);
  // Set as active
  setActiveConversationId(conv.id);
  return conv;
}

export function loadConversation(id: string): Conversation | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(convKey(id));
    if (!raw) return null;
    const conv = JSON.parse(raw) as Conversation;
    // Ensure defaults for any fields added after the conversation was created
    conv.settings = { ...DEFAULT_SETTINGS, ...conv.settings };
    if (conv.systemPromptBaseline === undefined) conv.systemPromptBaseline = null;
    if (conv.storyStateBaseline === undefined) conv.storyStateBaseline = null;
    if (!conv.lastIncludedAt) conv.lastIncludedAt = {};
    return conv;
  } catch {
    return null;
  }
}

export function saveConversation(conv: Conversation) {
  conv.updatedAt = new Date().toISOString();
  localStorage.setItem(convKey(conv.id), JSON.stringify(conv));
  // Keep index in sync
  const index = listConversations();
  const idx = index.findIndex((c) => c.id === conv.id);
  const meta: ConversationMeta = { id: conv.id, title: conv.title, createdAt: conv.createdAt, updatedAt: conv.updatedAt };
  if (idx >= 0) {
    index[idx] = meta;
  } else {
    index.unshift(meta);
  }
  saveIndex(index);
}

export function deleteConversation(id: string) {
  localStorage.removeItem(convKey(id));
  const index = listConversations().filter((c) => c.id !== id);
  saveIndex(index);
  // If deleted was active, clear active
  if (getActiveConversationId() === id) {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

export function renameConversation(id: string, title: string) {
  const conv = loadConversation(id);
  if (!conv) return;
  conv.title = title;
  saveConversation(conv);
}
