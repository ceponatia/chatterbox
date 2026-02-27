# AGENTS.md — `@chatterbox/sockets`

## Purpose

`@chatterbox/sockets` is the **boundary contract package** for the app.

It defines:

- stable interface types for socket boundaries
- default implementations that preserve current behavior
- zero-runtime-dependency contracts that other packages can implement

This package exists to keep prompt/state systems modular and safely swappable without coupling to Next.js, React, AI SDK internals, or app storage details.

## What belongs in this package

Allowed:

- socket interfaces (e.g. `PromptAssemblySocket`, `StateUpdateSocket`)
- boundary DTOs/types (`SocketMessage`, `AssemblyContext`, etc.)
- default implementations that are simple and deterministic
- small pure helpers used only by those defaults

Not allowed:

- framework code (React hooks/components)
- route handlers / server runtime logic
- SDK-specific types as public contracts (e.g. direct `UIMessage` coupling)
- direct app state/storage imports

## Public API and usage

Only import from the package root:

```ts
import {
  defaultPromptAssembly,
  defaultMessageProcessing,
  type PromptAssemblySocket,
} from "@chatterbox/sockets";
```

Do **not** deep-import internal files:

```ts
// ❌ forbidden
import { defaultPromptAssembly } from "@chatterbox/sockets/src/prompt-assembly";
```

`src/index.ts` is the only public entry point. Keep it as a clean barrel.

## Strict boundary rules

This package is enforced as a **leaf package**.

1. **Import boundary**
   - `packages/sockets` must not import from app packages.
   - `packages/sockets` should have no cross-package runtime dependencies.

2. **Type boundary**
   - Public socket types should remain SDK-agnostic and minimal.
   - Conversion between app/internal types and socket types happens at app boundaries.

3. **Export boundary**
   - `package.json` `exports` exposes only `.`
   - Internals under `src/*` are private implementation details.

4. **Determinism and safety**
   - Defaults should be predictable and low-risk.
   - Avoid side effects unless the socket explicitly models them (`PostResponseSocket`).

## Extending this package

When adding a new socket:

1. Add minimal input/output types to `src/types.ts` or a focused module.
2. Define an interface + default implementation in a new file.
3. Export types + default from `src/index.ts`.
4. Keep implementation pure and dependency-light.
5. Ensure the app integrates via package-root imports only.

## Validation checklist

Before merging socket changes, verify:

- `pnpm --filter @chatterbox/sockets typecheck`
- `pnpm --filter @chatterbox/sockets lint`
- app still compiles when consuming from `@chatterbox/sockets` root exports only
