# GLM 5 RP Test — Implementation Plan

## Overview

Build a local-first roleplay chat UI that talks to **GLM 5** (`z-ai/glm-5`) via the OpenRouter API. The app implements the memory/context strategies outlined in `overview.md` — pinned system prompt, managed Story State, periodic auto-summarization, and provider locking — so you can test long-form RP without the model "forgetting."

---

## GLM 5 Model Facts

| Property | Value |
| --- | --- |
| Model ID | `z-ai/glm-5` |
| Context window | 202,800 tokens |
| Max output | 131,100 tokens |
| Providers | AtlasCloud, NovitaAI, Z.ai, Phala |
| Price range | $0.80–$1.20 / $2.56–$3.50 (input/output per 1M tokens) |
| Strengths | Coding, reasoning, roleplay, agentic workflows |

---

## Environment Variables

| Variable | Description |
| --- | --- |
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `OPENROUTER_MODEL` | The model to use |

These are set in the root .env file.

## Recommended Tech Stack

| Layer | Choice | Why |
| --- | --- | --- |
| **Framework** | Next.js 15 (App Router) | Server-side API routes keep the API key off the client; App Router is the modern default |
| **Language** | TypeScript | Type safety for message schemas and API payloads |
| **Styling** | Tailwind CSS 4 + shadcn/ui | Fast to build, polished look, great component primitives |
| **Icons** | Lucide React | Pairs with shadcn/ui out of the box |
| **AI Integration** | Vercel AI SDK (`ai` + `@ai-sdk/openai`) | `useChat` hook handles streaming, message state, and retries; OpenAI-compatible so it works with OpenRouter's `/v1/chat/completions` endpoint directly |
| **Persistence** | Browser `localStorage` (MVP) → SQLite/Prisma (stretch) | Keeps it simple; no DB setup needed to start |
| **Package Manager** | pnpm | Fast, disk-efficient |

### Why Vercel AI SDK over raw fetch or `@openrouter/sdk`?

- `useChat` gives you streaming UI, message history, loading/error states, and abort control in one hook.
- It speaks the OpenAI-compatible protocol natively — just point `baseURL` at `https://openrouter.ai/api/v1`.
- No need to manually wire up SSE parsing or token-by-token rendering.

---

## Architecture

```markdown
┌─────────────────────────────────────────────────┐
│                  Browser (React)                │
│                                                 │
│  ┌───────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Chat UI   │  │ Story State│  │ Settings   │ │
│  │ (useChat) │  │ Editor     │  │ Panel      │ │
│  └─────┬─────┘  └─────┬──────┘  └─────┬──────┘ │
│        │               │               │        │
│        └───────┬───────┘───────────────┘        │
│                ▼                                 │
│        Context Assembler                        │
│  (builds messages[] for each request)           │
└────────────────┬────────────────────────────────┘
                 │ POST /api/chat
                 ▼
┌────────────────────────────────────────┐
│        Next.js API Route               │
│  - Injects system prompt (pinned)      │
│  - Injects Story State (pinned)        │
│  - Appends last N chat turns           │
│  - Calls OpenRouter (streaming)        │
│  - Locks provider, sets max_tokens     │
└────────────────┬───────────────────────┘
                 │
                 ▼
         OpenRouter API
      z-ai/glm-5
```

### Context Assembly Strategy (per request)

The API route assembles the `messages[]` array in this order every call:

1. **System prompt** (role: `system`) — RP rules + narration style, 200–500 tokens, rarely changes.
2. **Story State** (role: `system`) — cast, scene, threads, hard facts, 300–800 tokens, updated every 10–20 turns
3. **Recent chat history** — last 30–60 turns (user + assistant pairs)
4. **Current user message**

This ensures the critical context is always near the top AND bottom of the window, matching the "recency beats relevance" insight from the overview.

---

## Feature Breakdown

### Phase 1 — MVP (Core Chat Loop)

| # | Feature | Details |
| --- | --- | --- |
| 1 | **Project scaffolding** | `create-next-app` with TypeScript, Tailwind, App Router; install `ai`, `@ai-sdk/openai`, `shadcn/ui` |
| 2 | **Environment config** | `.env.local` for `OPENROUTER_API_KEY`; never exposed client-side |
| 3 | **API route** (`/api/chat`) | Receives messages from `useChat`, prepends system prompt + Story State, streams response from OpenRouter |
| 4 | **Chat UI** | Message list (user / narrator bubbles), input bar, auto-scroll, markdown rendering for NPC dialogue |
| 5 | **System prompt editor** | Sidebar or modal to edit the RP rules prompt; persisted to localStorage; pre-loaded with the prompt from `overview.md` |
| 6 | **Story State editor** | Editable text block for the structured Story State (cast, scene, threads, facts); persisted to localStorage |
| 7 | **Provider locking** | Hardcode `provider: { order: ["Z.ai"] }` — or let OpenRouter auto-route across AtlasCloud, NovitaAI, Z.ai, Phala |
| 8 | **Parameter controls** | Adjustable `temperature`, `max_tokens`, `top_p` via a settings panel |

### Phase 2 — Memory & Summarization

| # | Feature | Details |
| --- | --- | --- |
| 9 | **Turn counter** | Track turn count; show badge in UI |
| 10 | **Auto-summarize prompt** | Every N turns (turn-count based, configurable, default 15), automatically send the "Update Story State" instruction to the model and surface the result for review |
| 11 | **One-click Story State update** | After summarization, user can accept/edit/reject the new Story State before it's pinned |
| 11a | **Story State "last updated" timestamp** | Display the date/time of the last Story State update in the sidebar; auto-set on accept |

### Phase 3 — Polish & Persistence

| # | Feature | Details |
| --- | --- | --- |
| 12 | **Multi-session support** | Multiple named sessions with save/load/switch; compare runs with different system prompts or Story State strategies |
| 13 | **Session export/import** | Export/import full chat sessions (JSON) for backup or sharing |
| 14 | **localStorage persistence** | Auto-save chat history, system prompt, Story State on every change |
| 15 | **Dark mode** | Tailwind dark mode toggle (RP sessions tend to be long — easy on the eyes) |
| 16 | **Message actions** | Edit, delete, regenerate individual messages; fork conversation from a point |
| 17 | **Token counter** | Estimate token usage per request; warn when approaching context limits (deferred from Phase 2) |
| 18 | **Network inspector** | Debug panel showing the raw `messages[]` payload sent each turn (mirrors the DevTools trick from the overview) |
| 19 | **Non-blocking Story State review** | Move the Story State update/review modal into the sidebar so it doesn't interrupt chat flow |

---

## Key Implementation Details

### OpenRouter Integration

```typescript
// /api/chat/route.ts
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages } from "ai";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Chatterbox",
  },
});

export async function POST(req: Request) {
  const { messages, systemPrompt, storyState } = await req.json();

  const result = streamText({
    model: openrouter("z-ai/glm-5"),
    system: `${systemPrompt}\n\n## Current Story State\n${storyState}`,
    messages: convertToModelMessages(messages),
    temperature: 0.85,
    maxTokens: 1024,
    // provider-specific: lock provider, disable middle-out
  });

  return result.toDataStreamResponse();
}
```

### Client Chat Hook

```typescript
// useChat from Vercel AI SDK handles:
// - streaming token display
// - message history state
// - loading/error states
// - abort control
const { messages, input, handleSubmit, isLoading, stop } = useChat({
  api: "/api/chat",
  body: { systemPrompt, storyState }, // sent with every request
});
```

### Story State Schema (suggested default)

```markdown
## Cast
- **Sabrina Carpenter** — 25, singer/actress. Reuniting with Brian after years apart. In a relationship with Tyler (NYC musician, not present). Curious but guarded.
- **Brian Devereaux** — [player character, do not narrate]

## Scene
- **Where/When**: [to be filled during play]
- **Who is present**: Sabrina, Brian

## Open Threads
- Reconnection after years of distance
- Unspoken history and shared memories
- Tyler (boyfriend) exists but isn't here

## Hard Facts
- They were close in middle school / high school
- Brian stood up for Sabrina when she was bullied
- Separation was due to life momentum, not conflict
- Sabrina is in a relationship with Tyler (not serious but she cares)

## Style
- Present tense, 3-5 paragraphs per response
- No player-character narration
- Sensory details, subtext, grounded tone
```

---

## File Structure (Projected)

```markdown
chatterbox/
├── dev-docs/
│   ├── overview.md
│   └── plan.md              ← this file
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          ← main chat page
│   │   └── api/
│   │       └── chat/
│   │           └── route.ts  ← OpenRouter streaming endpoint
│   ├── components/
│   │   ├── chat/
│   │   │   ├── message-list.tsx
│   │   │   ├── message-bubble.tsx
│   │   │   ├── chat-input.tsx
│   │   │   └── turn-counter.tsx
│   │   ├── sidebar/
│   │   │   ├── system-prompt-editor.tsx
│   │   │   ├── story-state-editor.tsx
│   │   │   └── settings-panel.tsx
│   │   └── ui/               ← shadcn/ui components
│   ├── lib/
│   │   ├── context-assembler.ts
│   │   ├── token-counter.ts
│   │   ├── storage.ts        ← localStorage helpers
│   │   └── defaults.ts       ← default system prompt & story state
│   └── types/
│       └── index.ts
├── .env.local                ← OPENROUTER_API_KEY
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## Getting Started (Bootstrap Commands)

```bash
pnpx create-next-app@latest . --typescript --tailwind --app --src-dir --use-pnpm
pnpm add ai @ai-sdk/openai
pnpx shadcn@latest init
pnpx shadcn@latest add button input textarea card scroll-area badge sheet dialog
```

---

## Decisions (Resolved)

1. **Provider locking** — GLM 5 has multiple providers (AtlasCloud, NovitaAI, Z.ai, Phala). Currently locked to Z.ai but can be changed via provider order.
2. **Token counting** — Deferred to Phase 3. Not a priority for MVP/Phase 2.
3. **Summarization trigger** — Turn-count based (configurable, default 15 turns).
4. **Multi-session support** — Planned for Phase 3. Will support multiple named sessions with save/load/switch.

---

## Summary

The core idea is simple: a **Next.js streaming chat app** that acts as a smart wrapper around OpenRouter, implementing the memory strategies from the overview (pinned system prompt, managed Story State, periodic summarization) instead of relying on a naive "last N messages" approach. The Vercel AI SDK eliminates most of the streaming/state boilerplate, letting us focus on the RP-specific context management that actually matters.

Phase 1 is a weekend build. Phase 2 adds the summarization loop that the overview identifies as "the single biggest improvement." Phase 3 is polish.
