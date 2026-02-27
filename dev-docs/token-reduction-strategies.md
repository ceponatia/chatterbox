# Token Reduction Strategies: Beyond Brute Force

## Problem Statement

Every request to the inference endpoint sends a substantial non-user token payload that grows with conversation length. The current architecture is **flat**: the same monolithic system prompt (~2000 tokens), the full story state (~300-800 tokens), and a fixed 40-message recency window (potentially ~8,000-20,000 tokens) are sent verbatim on every single call. The summarize endpoint compounds this by resending all of the above plus a ~400-token instruction block.

This document proposes **multiple independent systems** that each attack a different slice of the token budget. They are designed to be built incrementally — skunk prototype first, then layered upgrades — and each build path feeds into the next.

---

## Development Principle: Detached Build, Socket Integration

All new systems described in this document should be **developed detached from the running app**. The app must remain fully usable throughout development — no broken intermediate states, no half-wired features.

### How it works

Each new system is built as a **standalone module** with well-defined input/output boundaries. It does not import from or depend on the live app code during development. It can be tested in isolation (unit tests, standalone scripts, or a dedicated test harness).

When a system reaches a milestone — meaning it's functionally complete, tested, and ready — it gets **wired into the app** through a socket: a thin integration point on the app side that the system plugs into.

### Sockets on the app

To enable this, we add small, inert **socket interfaces** to the app ahead of time. These are integration points that the app currently ignores (it uses its existing logic) but that a new system can later claim. Examples:

- **Prompt assembly socket**: `buildSystem()` currently concatenates strings. Add a socket that optionally delegates to an external assembler. Until the assembler is wired in, `buildSystem()` behaves exactly as it does today.
- **State update socket**: The summarization hook currently calls `/api/summarize` directly. Add a socket that can be pointed at a different pipeline endpoint. Until switched, the current summarizer runs unchanged.
- **Message preprocessing socket**: `windowMessages()` currently does a flat slice. Add a socket that optionally runs a preprocessing function on the message array before it's sent. Until wired, the flat slice is the default.
- **State validation socket**: After state is generated, a socket allows an optional validation function to inspect it before acceptance. Until wired, all state passes through.

A socket is just a function signature with a default implementation (the current behavior). Wiring a new system in means replacing the default with the new module's export. This can be done behind a feature flag or environment variable so it's trivially reversible.

### Pattern

```typescript
// Example socket in route.ts
import type { SystemPromptAssembler } from "@/lib/prompt-assembly/types";

// Default: current behavior
const defaultAssembler: SystemPromptAssembler = {
  assemble: ({ systemPrompt, storyState }) =>
    storyState ? `${systemPrompt}\n\n## Current Story State\n${storyState}` : systemPrompt,
};

// Socket — swap this to wire in the real assembler
const assembler: SystemPromptAssembler =
  process.env.USE_PROMPT_ASSEMBLER === "true"
    ? require("@/lib/prompt-assembly").assembler
    : defaultAssembler;
```

### Why this matters

- **Zero downtime during development** — the app works exactly as it does today until a system is explicitly connected
- **Independent testing** — each system can be validated in isolation before it touches live conversations
- **Easy rollback** — if a newly wired system causes issues, flip the flag back to the default
- **Parallel development** — multiple systems can be built simultaneously without stepping on each other or the app
- **Clean boundaries** — forces each system to have a well-defined interface, which makes the codebase more maintainable long-term

### Socket preparation

Adding sockets to the app is an early task (Phase 0) and should be done before building any new systems. The sockets themselves are no-ops — they don't change behavior — so they're safe to merge immediately. This gives every subsequent system a clean plug-in target from day one.

---

## Token Budget Anatomy (Current)

| Component | Tokens (approx) | Sent Every Turn? | Growth Pattern |
| --- | --- | --- | --- |
| System prompt (character spec + rules) | ~2,000 | Yes, verbatim | Static |
| Story state | 300–800 | Yes, verbatim | Grows with summarizations |
| Message history (up to 40 msgs) | 8,000–20,000 | Yes, verbatim | Linear with conversation |
| Summarize instruction (summarize calls) | ~400 | Every N turns | Static |
| **Total per chat call** | **~10,000–23,000** | | |
| **Total per summarize call** | **~11,000–24,000** | | |

The message history is the largest and fastest-growing component. The system prompt is the largest *static* component. Both are targets.

---

## Strategy Overview

| # | System | Targets | Skunk Effort | Token Savings |
| --- | --- | --- | --- | --- |
| 1 | Tiered Message Compression | Message history | Low | 30–60% of history |
| 2 | Segmented Prompt Assembly | System prompt | Low | 20–40% of system prompt per turn |
| 3 | Structured State Objects | Story state | Low-Med | 15–30% of story state + precision gains |
| 4 | Importance-Scored Message Selection | Message history | Medium | 40–70% of history |
| 5 | Retrieval-Augmented History (RAG) | Message history | Medium-High | 50–80% of history |
| 6 | Dual-Model Context Compiler | All dynamic context | Medium | Compounds other savings |
| 7 | Provider-Level Prompt Caching | Cost/latency only | Low | 0 tokens, but ↓ cost + latency |

These are **not** mutually exclusive. They compose along two upgrade tracks.

---

## Track A: Message History Optimization

This track addresses the biggest token consumer. Each phase builds on the previous.

### A1 — Tiered Message Compression

**Concept**: Instead of sending 40 messages at full fidelity, divide the window into recency tiers with decreasing resolution.

**Current behavior**:
```
[msg 1 full] [msg 2 full] [msg 3 full] ... [msg 40 full]
```

**Proposed behavior**:
```
[msgs 1-20: compressed digest]  [msgs 21-32: light summary per exchange]  [msgs 33-40: verbatim]
```

**Skunk prototype (v0)**:
- Server-side, before calling `streamText`, partition the windowed messages into 3 tiers:
  - **Verbatim tier** (last 8 messages): sent as-is
  - **Summary tier** (messages 9–24): each user-assistant pair collapsed to a 1–2 sentence summary
  - **Digest tier** (messages 25–40): entire block collapsed into a single paragraph
- The compression in v0 is **heuristic** — no LLM call needed:
  - Strip markdown formatting, sensory description, and narration filler
  - Keep quoted dialogue, character names, stated actions, and questions
  - Truncate each assistant message to first sentence + last sentence
- Inject the compressed tiers as a synthetic `[Conversation History Summary]` block before the verbatim messages

**Why this works**: The model already struggles to attend to messages in the middle of long context. By explicitly compressing older messages, we're doing what the model's attention mechanism would do implicitly — but we control what survives.

**Upgrade path**:
- **v1**: Use the inference endpoint itself (or a smaller model) to summarize each tier, giving much better compression quality
- **v2**: Merge with importance scoring (A2) so tier placement is based on relevance, not just recency
- **v3**: Merge with RAG (A3) so the model gets the verbatim tier + retrieved relevant snippets from any point in history

**Estimated savings**: 30–60% of message history tokens at v0, improving to 50–80% at v2+.

**Implementation surface**: Entirely server-side in `route.ts`. No UI changes. No new dependencies. Can be built and A/B tested in a single file.

---

### A2 — Importance-Scored Message Selection

**Concept**: Not all messages are equally important. A message that introduces a new character, reveals a secret, or shifts a relationship is worth more context budget than a message about the weather.

**Skunk prototype (v0)**:
- Assign each message a simple heuristic importance score:
  - **+3** if it contains a character name from the Cast section
  - **+2** if it contains a question or exclamation
  - **+2** if it's longer than the median message length (proxies for "something happened")
  - **+1** if it contains emotional/relationship keywords (trust, sorry, love, angry, etc.)
  - **+1** base recency bonus that decays linearly with age
- Select messages by score-weighted sampling within each tier from A1
- The highest-scored old messages get promoted to the summary tier (or even verbatim tier) regardless of age

**Why this works**: It breaks the assumption that recency = relevance. A pivotal moment from 30 turns ago may matter more than casual banter from 5 turns ago.

**Upgrade path**:
- **v1**: Use embeddings (e.g. from a local model or a cheap embedding API) to score semantic similarity between the current user message and each historical message — retrieve the most relevant ones
- **v2**: Train a lightweight importance classifier on user engagement signals (which messages did the user reference back to? which story state fields changed after which messages?)

**Estimated savings**: An additional 10–20% on top of A1 at v0, significantly more at v1+ (because you can shrink the verbatim tier and rely on retrieval).

**Implementation surface**: A new `src/lib/message-scorer.ts` utility. Integrates with the tiered compression from A1.

---

### A3 — Retrieval-Augmented History (RAG for Chat)

**Concept**: For conversations that span hundreds of turns, even a compressed 40-message window loses critical information. Instead of a fixed window, embed all messages and retrieve the ones most relevant to the current conversational moment.

**Skunk prototype (v0)**:
- When a message is added to history, extract a simple "fact fingerprint" — a bag of keywords + entity names
- On each turn, compute keyword overlap between the current user message and all historical fingerprints
- Retrieve the top 5–10 most relevant historical messages (beyond the verbatim window) and inject them as a `[Relevant Earlier Context]` block
- Use the browser's own storage (IndexedDB) so no external vector DB is needed

**Why this works**: This is the mechanism that lets you break free from the fixed window entirely. The model sees recent context + specifically relevant old context, even from hundreds of turns ago.

**Upgrade path**:
- **v1**: Use a proper embedding model (e.g. via an API or a small WASM-based model in the browser) for semantic search instead of keyword overlap
- **v2**: Run the embedding + retrieval server-side with a lightweight vector store (e.g. `hnswlib` or SQLite with `sqlite-vss`)
- **v3**: Add metadata filters (retrieve only messages involving a specific character, or from a specific scene)

**Estimated savings at v0**: Modest direct savings, but enables reducing the main window size from 40 to 15–20 messages while *improving* continuity — net 40-60% history reduction.

**Implementation surface**: New `src/lib/message-index.ts`. Uses IndexedDB for storage. No external dependencies at v0.

---

## Track B: Prompt and State Optimization

This track addresses the static/semi-static context that's sent every turn.

### B1 — Segmented Prompt Assembly (Conditional Injection)

**Concept**: The 2000-token system prompt is a monolith. Not all of it is needed every turn. Split it into **tagged segments** with injection policies.

**Current structure** (one blob):
```
[Rules] [Output format] [Setting] [Character bio] [Appearance] [Speech patterns]
[Voice description] [Mannerisms] [Outfit] [Hairstyle] [Backstory] [Interaction guidelines]
```

**Proposed structure** (segments with policies):
```yaml
segments:
  core_rules:        { tokens: ~350, policy: always }
  output_format:     { tokens: ~150, policy: always }
  setting_premise:   { tokens: ~80,  policy: always }
  character_identity:{ tokens: ~200, policy: always }
  speech_patterns:   { tokens: ~350, policy: every_turn }  # could be every-2-turns
  appearance_visual: { tokens: ~300, policy: every_N(8) }   # or on appearance_refresh trigger
  voice_description: { tokens: ~200, policy: every_N(5) }
  mannerisms:        { tokens: ~150, policy: every_N(3) }
  outfit_hairstyle:  { tokens: ~200, policy: every_N(8) }   # syncs with appearance refresh
  backstory:         { tokens: ~200, policy: every_N(10) }  # or when relationship topics detected
  interaction_guide: { tokens: ~200, policy: always }
```

**Skunk prototype (v0)**:
- Define a `PromptSegment` type: `{ id, content, policy, turnCounter }`
- Policy types: `always`, `every_N(n)`, `on_topic(keywords[])`
- On each turn, `buildSystem()` iterates segments, includes those whose policy fires, and assembles the system string
- A turn counter per segment tracks when it was last included
- The **omitted segments' names** are listed in a one-liner: `"[Full character details for speech patterns, appearance, and backstory are established and available. Refer to prior context.]"` — this cues the model that the information exists even when not present

**Why this works**: LLMs are trained to attend to what's in the prompt. If appearance details aren't in the prompt, the model won't hallucinate different appearance — it simply won't describe appearance in that response (which is fine for most turns). When appearance IS needed (triggered by the appearance refresh system or the `every_N` policy), the full details are included.

**Critical nuance**: The core character identity, rules, and output format should **always** be present. The savings come from rotating the supplementary detail segments.

**Upgrade path**:
- **v1**: Add `on_topic(keywords[])` policy — detect keywords in the user's last message and inject relevant segments. E.g., if the user mentions "hair" or "wearing," inject appearance. If they mention "voice" or "singing," inject voice description.
- **v2**: Use embeddings to match user input to segment content — fuzzy topic detection
- **v3**: Let the model itself request segments by emitting structured tokens (tool-use pattern), making the system fully demand-driven

**Estimated savings**: 20–40% of system prompt tokens per turn at v0. The absolute savings grow if/when dialogue examples and other planned additions inflate the prompt further.

**Implementation surface**: Refactor `defaults.ts` to export segments instead of a monolith. Refactor `buildSystem()` in `route.ts`. New `src/lib/prompt-segments.ts` for the assembly logic. The UI system prompt editor would need a minor update to display/edit segments (but v0 can keep the monolithic editor and do segmentation server-side only).

---

### B2 — Structured State Objects

**Concept**: Replace the markdown story state with a typed JSON schema. JSON is inherently more token-dense than markdown prose, and it enables precise field-level operations.

**Current story state** (~150 tokens for this fragment):
```markdown
## Cast
- **Sabrina Carpenter** — 25, singer/actress. Reuniting with Brian after years apart.
  In a relationship with Tyler (NYC musician, not present). Curious but guarded.
- **Brian Devereaux** — [player character, do not narrate]
```

**Structured equivalent** (~90 tokens):
```json
{"cast":[
  {"name":"Sabrina Carpenter","age":25,"role":"singer/actress",
   "summary":"Reuniting with Brian after years apart. Curious but guarded.",
   "relationship_status":"In relationship with Tyler (NYC musician, not present)"},
  {"name":"Brian Devereaux","role":"player","note":"do not narrate"}
]}
```

**Why this works beyond token savings**:
1. **Precision**: The model can update individual fields without rewriting the whole block
2. **Diffing**: Trivial to compute what changed between summarization cycles (enables System B3)
3. **Validation**: The server can validate that summarization output conforms to schema before accepting
4. **Selective injection**: Individual state fields can be included/excluded per turn (composes with B1)
5. **Provenance**: Each field can carry metadata (last_updated_turn, source) cheaply

**Skunk prototype (v0)**:
- Define a TypeScript interface for the story state schema
- The summarizer is instructed to output JSON (models are generally good at this)
- `buildSystem()` serializes the JSON into a compact format when injecting into the prompt
- The Story State editor displays the JSON as formatted fields (not raw JSON — a simple key-value UI)
- Maintain backward compatibility: if the user pastes markdown, parse it into the schema best-effort

**Upgrade path**:
- **v1**: Field-level diffing — show the user exactly what changed in each summarization (field highlights)
- **v2**: Selective field injection — only inject fields relevant to the current scene/topic
- **v3**: Versioned state — maintain a changelog of state transitions, enabling rollback and analysis

**Estimated savings**: 15–30% of story state tokens. The bigger win is the precision and composability it enables.

**Implementation surface**: New `src/lib/state-schema.ts` for types. Update `SUMMARIZE_INSTRUCTION` to request JSON output. Update the Story State editor component. Update `buildSystem()`.

---

### B3 — Differential State Injection

**Concept**: Between summarization cycles, the story state doesn't change. But even when it does change, most fields stay the same. Instead of sending the full state every turn, send the full state once, then send only deltas until the next full refresh.

**Skunk prototype (v0)** (requires B2):
- After each summarization, compute a JSON diff between old and new state
- On the 1st turn after summarization: inject full state
- On turns 2–N: inject a compact `[State unchanged since turn X]` marker, OR inject only the fields that changed plus the marker
- Every K turns (e.g., every 5), inject the full state as a refresh

**Why this works**: For a 500-token story state that changes every 15 turns, you're sending 500 tokens × 15 turns = 7,500 tokens of unchanged state. With diffs, you send 500 + (14 × ~30) = ~920 tokens — an 88% reduction.

**Caveat**: This relies on the model remembering the full state from N turns ago. In practice, with a rolling message window, the full state injection from turn 1 post-summarization may have already scrolled out. The periodic refresh every K turns mitigates this, and the story state being in the system message (which is always present) means it persists outside the message window. **This strategy works best for the story state block within the system message itself**, where the full version is always available from the last time it was fully injected.

**Implementation surface**: Builds directly on B2's schema. Adds a diff utility in `src/lib/state-diff.ts`. Modifies `buildSystem()`.

---

## Track C: Meta-Architecture

### C1 — Dual-Model Context Compiler

**Concept**: Use a small, fast, cheap model as a "context preprocessor" that runs before the main generation call. It receives the full raw context and produces a compressed version optimized for the main model.

**What the compiler does**:
- Summarizes the message tiers from A1 (replacing heuristic compression with LLM compression)
- Decides which prompt segments from B1 to include (replacing keyword heuristics with understanding)
- Extracts relevant historical facts for the RAG system from A3

**Skunk prototype (v0)**:
- Use the **same model** (GLM 5) but with low `maxOutputTokens` (256) and low `temperature` (0.2) for the compilation step
- The compiler receives: full system prompt + story state + last 40 messages + current user message
- It produces: a ~500-token "context brief" summarizing what the main model needs to know beyond what's in the verbatim recent messages
- The main model receives: core system prompt + story state + context brief + last 8 verbatim messages + current user message
- **This is a second API call per turn**, so it trades latency for token efficiency on the main call

**Why this works**: The compilation call is cheap (low output tokens, can use a cheaper provider tier). The main generation call gets a much tighter context, which means:
- Fewer input tokens = lower cost
- Tighter context = better attention allocation = potentially better output quality
- The compilation step can be cached if the user doesn't send a message (e.g., for retries)

**Upgrade path**:
- **v1**: Use a genuinely smaller/cheaper model for compilation (e.g., a 7B model via OpenRouter)
- **v2**: Run compilation in parallel with user typing (speculative preprocessing)
- **v3**: Fine-tune the compiler model for this specific task

**Estimated savings**: Reduces the main call's input from ~15,000-23,000 tokens to ~4,000-6,000 tokens. The compiler call itself costs ~15,000-23,000 input tokens + ~256 output tokens, but at a potentially lower per-token cost.

**Net token economics**: Total tokens across both calls is slightly *higher* than current, but the **main call** (which determines output quality and latency) is dramatically smaller. This is a quality-per-token optimization, not a raw token reduction — though if the compiler uses a cheaper model, total cost decreases.

---

### C2 — Provider-Level Prompt Caching

**Concept**: Some providers (Anthropic, Google, and increasingly others) support prompt caching — if the prefix of your prompt matches a recent request, the provider skips KV-cache computation for those tokens. This doesn't reduce token count but reduces cost and latency.

**Implementation**: Restructure `buildSystem()` so the stable prefix (system prompt) is separated from the dynamic suffix (story state). Send them as separate system messages if the provider supports it, or ensure the story state is appended (not prepended) to maximize prefix cache hits.

**Current**:
```
system: "{2000-token system prompt}\n\n## Current Story State\n{800-token story state}"
```
Between turns, the entire system message changes if story state changed → no cache hit.

**Optimized**:
```
system[0]: "{2000-token system prompt}"          ← cacheable across all turns
system[1]: "## Current Story State\n{story state}" ← changes only on summarization
```

**Effort**: Trivial. Just split the system string into two messages or use a provider-specific caching hint header.

**Savings**: 0 tokens, but potentially 50-90% latency reduction on the system prompt portion, depending on provider support.

---

## Recommended Build Sequence

### Phase 0: Sockets + quick wins (1-2 days)

1. **Add socket interfaces to the app** — Define no-op sockets for prompt assembly, state update, message preprocessing, and state validation. These don't change behavior; they prepare plug-in targets for all subsequent systems. Safe to merge immediately.
2. **C2 — Prompt caching structure** — Split system message for cacheability. Trivial change.
3. **B1 v0 — Segment the system prompt** — Build the assembler and segments as a detached module. Wire into the prompt assembly socket when ready.

### Phase 1: Message history compression (3-5 days)

1. **A1 v0 — Tiered heuristic compression** — Implement 3-tier message compression in `route.ts`. No new dependencies.
2. **A2 v0 — Heuristic importance scoring** — Add simple scorer, integrate with tier assignment.

### Phase 2: Structured state (3-5 days)

1. **B2 v0 — JSON story state schema** — Define schema, update summarizer instruction, update editor.
2. **B1 v1 — Topic-triggered segments** — Add keyword-based `on_topic` policies using story state field names as triggers.

### Phase 3: Intelligence layer (1-2 weeks)

1. **A1 v1 — LLM-powered tier compression** — Replace heuristic compressor with a model call.
2. **C1 v0 — Dual-model context compiler** — Introduce the compilation step, subsumes A1 v1.
3. **A3 v0 — Keyword-based history retrieval** — Add IndexedDB message index, retrieve relevant old messages.

### Phase 4: Full sophistication (ongoing)

1. **A3 v1 — Embedding-based retrieval** — Proper semantic search for history.
2. **B2 v1-v3 — Field-level diffs, selective injection, versioning**
3. **C1 v1+ — Smaller compiler model, speculative preprocessing**

---

## How These Systems Compose

```
                    ┌─────────────────────────┐
                    │   C1: Context Compiler   │ (Phase 3+)
                    │  small model preprocessor│
                    └─────────┬───────────────┘
                              │ produces compressed context
                              ▼
┌──────────────┐    ┌─────────────────────────┐    ┌──────────────────┐
│ B1: Segmented│───▶│   Context Assembly      │◀───│ A1+A2: Tiered +  │
│ Prompt       │    │   (buildSystem v2)      │    │ Scored History   │
│ (conditional │    │                         │    │                  │
│  injection)  │    │ Assembles final payload │    │ A3: RAG retrieval│
└──────────────┘    │ for main model call     │    └──────────────────┘
                    └─────────┬───────────────┘
┌──────────────┐              │
│ B2+B3:       │──────────────┘
│ Structured   │
│ State + Diffs│
└──────────────┘
```

Each system is independently valuable but they reinforce each other. The structured state (B2) makes the compiler (C1) more effective. The importance scorer (A2) makes the tiered compression (A1) smarter. The segmented prompt (B1) reduces what the compiler needs to process.

---

## What This Is NOT

- **Not prompt shortening**: We're not asking you to write a shorter character description. The information stays; its *delivery* becomes intelligent.
- **Not window shrinking**: We're not just setting `MAX_MESSAGES = 20`. We're replacing the flat window with a multi-resolution representation.
- **Not a single silver bullet**: These are independent systems that each contribute. The power is in their composition, not in any one being transformative alone.

---

## Metrics to Track

Once any of these systems are implemented, measure:

1. **Input tokens per chat call** — primary metric
2. **Input tokens per summarize call** — secondary
3. **Output quality (subjective)** — does the model still stay in character? Does it remember important facts?
4. **Latency** — does compression overhead add more time than token reduction saves?
5. **Cache hit rate** — for C2, what % of system prompt tokens are cached?
6. **Continuity failures** — how often does the model "forget" something that was compressed/omitted? Track these to tune policies.
