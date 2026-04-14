---
description: "Use when creating or modifying API route handlers under apps/web/src/app/api/. Covers logging, error handling, Prisma usage, and response shapes."
applyTo: "apps/web/src/app/api/**"
---

# API Route Conventions

## Logging

Import named functions from the shared logger — no instantiation needed:

```ts
import { logRequest, startTimer, logError } from "@/lib/api-logger";
```

- Call `logRequest(req)` at the top of every handler.
- Use `startTimer()` to capture elapsed time for LLM calls.
- Use `logStreamStart`/`logStreamEnd` for streaming routes, `logResponse` for non-streaming.
- Always `logError` in catch blocks.

## Prisma

```ts
import { prisma } from "@/lib/prisma";
```

Single import, singleton instance. Never instantiate `PrismaClient` directly.

## Error Handling

- **LLM routes** (`/api/chat`, `/api/state-update`): wrap the LLM call in `try/catch`, return `Response.json({ error: message }, { status: 500 })`.
- **CRUD routes** (`/api/conversations`): validate input, return `{ error: string }` with appropriate status (400, 404). No try/catch — let Next.js handle unexpected errors.

## Response Shapes

| Route type        | Success                                       | Error                                       |
| ----------------- | --------------------------------------------- | ------------------------------------------- |
| CRUD              | `NextResponse.json(data)` — bare typed object | `NextResponse.json({ error }, { status })`  |
| Streaming (chat)  | `result.toUIMessageStreamResponse()`          | `Response.json({ error }, { status: 500 })` |
| Non-streaming LLM | `Response.json({ ...fields })`                | `Response.json({ error }, { status: 500 })` |
| DELETE            | `NextResponse.json({ ok: true })`             | —                                           |

No success envelope — data is returned directly.

## Streaming

Use Vercel AI SDK's `streamText` for chat, `generateText` for non-streaming LLM calls:

```ts
import { streamText } from "ai";
const result = streamText({ model, system, messages });
return result.toUIMessageStreamResponse();
```
