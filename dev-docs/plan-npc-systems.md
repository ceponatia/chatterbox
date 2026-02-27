# Plan: NPC Systems & Chat Resilience (TBD Items 1–4)

This plan addresses the four features from `tbd.md` items 1–4. Each section covers the motivation, design, and implementation steps.

---

## 1. NPC Dialogue Examples (Quotes & Conversation Snippets)

### Goal

Give the LLM concrete examples of how each NPC speaks so it can stay in-voice — especially for NPCs whose speech patterns are nuanced (cadence, slang, humor style). Currently the system prompt describes speech patterns in prose; loading actual example quotes/snippets will ground the model's output more reliably.

### Design

- **Data format**: Each NPC gets a companion `.md` or `.json` file containing a `## Dialogue Examples` section with 5–15 short quotes and 2–4 multi-turn conversation snippets. These live alongside the existing prompt files in `/prompts/` (e.g. `prompts/dialogue-sabrina.md`).
- **Loading**: When a system prompt is imported, the UI checks for a matching dialogue file (convention: `dialogue-{npc-slug}.md` next to the system prompt file, or a `dialogueExamples` key in a JSON prompt bundle). If found, it's loaded automatically.
- **Injection point**: The dialogue examples are appended to the system prompt as a `### Dialogue Examples` section before it's sent to the API. They sit after the character definition but before the Story State, so the model sees them as part of the character spec.
- **Token budget**: Cap at ~400 tokens. The import UI should warn if the file exceeds this.
- **Manual override**: The sidebar System Prompt tab gets a small "Examples" sub-section (read-only display with a "Clear" button) so the user can see what's loaded and remove it if desired.

### Implementation Steps

1. Define the dialogue example file format and add a sample `prompts/dialogue-sabrina.md`.
2. Add a `dialogueExamples` field to the conversation state in `storage.ts` and `use-field-setters.ts`.
3. Update the system prompt import flow (`handleSystemPromptImport`) to auto-detect and load a companion dialogue file.
4. Update `buildSystem()` in `src/app/api/chat/route.ts` to inject the dialogue examples section into the system prompt.
5. Add a read-only "Dialogue Examples" display to the System Prompt sidebar tab.

---

## 2. NPC Attitude / Rapport Tracking

### Goal

Track each NPC's attitude toward the player as a persistent, evolving value in the Story State. The attitude should shift bi-directionally based on conversation — building rapport through positive interactions or losing it through negative ones — without the user having to manually edit it.

### Design

- **State representation**: Add a `## Rapport` section to the Story State schema. Each NPC gets an entry:
  ```
  ## Rapport
  - **Sabrina → Brian**: 6/10 — Warm but guarded. Trust building after the café conversation. Still testing reliability.
  ```
  The numeric score (1–10) gives the LLM a concrete anchor; the prose qualifier gives it nuance.
- **Updates via summarization**: The existing summarization instruction (`SUMMARIZE_INSTRUCTION` in `/api/summarize/route.ts`) already updates structured Story State sections. Add a `## Rapport` section to the instruction template with rules:
  - Evaluate how interactions since the last update shifted each NPC's attitude.
  - Adjust the numeric score ±1–2 per summarization cycle (no wild swings).
  - Update the prose qualifier to reflect the new dynamic.
  - Movement should be justified by specific conversational evidence.
- **System prompt guidance**: Add a line to the system prompt's interaction guidelines telling the model to factor the Rapport section into NPC behavior — e.g., an NPC at 3/10 rapport is distant and curt; at 8/10 they're open and warm.
- **No new UI needed initially** — the rapport data lives in Story State and is visible/editable in the existing Story State editor. A future enhancement could add a visual rapport meter to the sidebar.

### Implementation Steps

1. Add a `## Rapport` section to the Story State template in `defaults.ts` and the template file `prompts/story-state-template.md`.
2. Update `SUMMARIZE_INSTRUCTION` in `src/app/api/summarize/route.ts` to include the `## Rapport` section with scoring rules.
3. Add guidance to the system prompt template (`prompts/system-prompt-template.md`) instructing the model to reference Rapport when writing NPC behavior.
4. Update existing story state files (`story-state-sabrina.md`, `story-state-alex.md`) with initial Rapport entries.

---

## 3. Appearance Refresh Tracking

### Goal

Prevent the narrative from going too many turns without reminding the reader what the NPC looks like. After `n` turns without an appearance mention, the system should prompt the LLM to weave in a brief visual reminder. The appearance description itself should be updatable by the LLM when the NPC changes clothes, hairstyle, etc.

### Design

- **Turn tracking**: Add a `turnsSinceAppearanceMention` counter to the conversation state. It increments each assistant turn. It resets to 0 when the model's response mentions appearance-related keywords (detected via a lightweight client-side heuristic or, more reliably, via an LLM-side instruction).
  - **Preferred approach (LLM-side)**: Add a small instruction to the system prompt: *"If it has been more than N turns since you described the NPC's appearance, weave a brief sensory detail about their look into your next response."* The model self-tracks based on the `## Appearance` section in Story State.
  - The Story State `## Appearance` section (already present in the summarization template) serves as the source of truth for current appearance.
- **Configurable threshold**: Add an `appearanceRefreshInterval` setting to the Settings panel (default: 8 turns). This value is injected into the system prompt dynamically.
- **Appearance mutation**: The summarization instruction already includes an `## Appearance` section with the rule "Only update if clothing, hair, or presentation changed during the conversation." This is sufficient — no additional mechanism needed. The LLM updates appearance in Story State during summarization when it detects a change occurred.
- **System prompt injection**: At request time, `buildSystem()` appends a line like: *"It has been approximately {n} turns since the NPC's appearance was last described. If this exceeds {threshold}, include a brief visual detail in your next response."*

### Implementation Steps

1. Add `appearanceRefreshInterval` (default: 8) to the `Settings` type in `defaults.ts` and the Settings panel UI.
2. Add `turnsSinceAppearanceMention` to the conversation state in `storage.ts` and `use-field-setters.ts`.
3. Increment the counter on each assistant message in the chat flow. Reset it when a summarization cycle updates the `## Appearance` section (conservative reset), or when the user manually resets it.
4. Update `buildSystem()` in `src/app/api/chat/route.ts` to inject the appearance refresh hint when the counter exceeds the threshold.
5. Add the appearance-refresh instruction to the system prompt templates.

---

## 4. Auto-Retry with Provider Rotation on Empty Responses

### Goal

When the `/api/chat` streaming endpoint returns 0 tokens (which already gets a console warning), automatically retry the request. On retry, rotate to the next provider in the configured preferred order list, so a single provider's transient failure doesn't block the conversation.

### Design

- **Current state**: The chat route (`/api/chat/route.ts`) already warns on 0-char responses in `onFinish`. The summarize route already implements a single retry on empty response. The provider order is hardcoded: `["Phala", "NovitaAI", "Z.ai"]`.
- **Provider rotation**: Extract the provider order into a constant. On retry, shift the list so the next provider becomes primary:
  ```
  Attempt 1: ["Phala", "NovitaAI", "Z.ai"]
  Attempt 2: ["NovitaAI", "Z.ai", "Phala"]
  Attempt 3: ["Z.ai", "Phala", "NovitaAI"]
  ```
- **Retry logic (server-side)**: Since the chat route uses `streamText` (streaming), detecting 0 tokens mid-stream is tricky. Two approaches:
  - **Option A (recommended)**: Handle retry on the **client side**. The `useChat` hook's `onFinish` callback can detect an empty assistant message. If empty, the client automatically re-sends the last user message with a `retryAttempt` parameter. The API route reads `retryAttempt` to determine which provider rotation to use. Cap at 3 attempts.
  - **Option B**: Switch to `generateText` for the retry attempt only (non-streaming fallback), similar to how `/api/summarize` works. Less ideal because the user loses streaming feedback on the retry.
- **User feedback**: Show a subtle toast or inline indicator ("Empty response — retrying with next provider…") so the user knows what's happening.
- **Max retries**: 3 (one per provider). After exhausting all providers, surface the error to the user.

### Implementation Steps

1. Extract the provider order into a shared constant (e.g. `PROVIDER_ORDER` in `defaults.ts` or a new `src/lib/providers.ts`).
2. Update `/api/chat/route.ts` to accept an optional `retryAttempt` number in the request body. Use it to rotate the provider order array.
3. Add client-side empty-response detection in `page.tsx` (or a new hook). When an assistant message arrives with 0 content tokens, auto-retry with `retryAttempt: 1`, incrementing on subsequent failures.
4. Add a toast/notification component to show retry status to the user.
5. Cap retries at 3. After 3 failures, display an error message in the chat.
6. Apply the same provider rotation logic to `/api/summarize/route.ts` for consistency.

---

## Priority & Sequencing

| Order | Feature | Complexity | Dependencies |
| --- | --- | --- | --- |
| **1st** | #4 — Auto-retry + provider rotation | Low | None — standalone resilience fix |
| **2nd** | #2 — Rapport tracking | Low–Med | Summarization template update only |
| **3rd** | #3 — Appearance refresh | Medium | Settings panel, system prompt injection |
| **4th** | #1 — Dialogue examples | Medium | New file format, import flow, UI addition |

Rationale: #4 is a reliability fix with immediate impact. #2 and #3 leverage the existing summarization pipeline. #1 requires the most new surface area (file format, import logic, UI).
