---
Status: Completed
Last Updated: 2026-02-13 13:46
---

# Monorepo Conversion & Boundary Hardening Plan

## Goal

Convert the project to a pnpm workspace monorepo with strict, compiler-enforced boundaries between packages. New systems (prompt assembly, state pipeline, message compression) will be developed as independent packages that plug into the app through well-defined socket interfaces.

## Structure

```
chatterbox/
├── apps/
│   └── web/                        # Next.js application
│       ├── src/                    # (moved from root)
│       ├── public/                 # (moved from root)
│       ├── package.json            # app deps + workspace:* dep on @chatterbox/sockets
│       ├── tsconfig.json           # extends ../../tsconfig.base.json
│       ├── next.config.ts
│       ├── postcss.config.mjs
│       ├── components.json
│       └── .env
├── packages/
│   └── sockets/                    # @chatterbox/sockets — shared interfaces + defaults
│       ├── src/
│       │   ├── index.ts            # public API barrel
│       │   ├── prompt-assembly.ts  # PromptAssembler interface + default
│       │   ├── state-update.ts     # StateUpdater interface + default
│       │   ├── message-processing.ts
│       │   └── post-response.ts
│       ├── package.json            # zero runtime deps
│       └── tsconfig.json           # extends ../../tsconfig.base.json
├── dev-docs/                       # stays at root
├── prompts/                        # stays at root (shared data)
├── .windsurf/                      # stays at root
├── package.json                    # workspace root — scripts only, no deps
├── pnpm-workspace.yaml             # packages: ["apps/*", "packages/*"]
├── tsconfig.base.json              # shared strict compiler settings
├── eslint.config.mjs               # root config with boundary rules
└── .gitignore
```

## Boundary Enforcement (4 layers)

### Layer 1: Package boundaries (pnpm workspace)

Each package has its own `package.json` with explicit dependencies. You cannot import a package you haven't declared as a dependency. pnpm's strict mode enforces this at the package manager level.

### Layer 2: TypeScript project references

Each package's `tsconfig.json` declares `composite: true` and only references its declared dependencies. The TypeScript compiler enforces that a package can only see types from its references.

### Layer 3: Package exports field

Each package's `package.json` uses the `exports` field to define its public API. Files not listed in `exports` cannot be imported from outside the package. This prevents reaching into internal implementation files.

### Layer 4: ESLint boundary rules

`eslint-plugin-boundaries` enforces at lint time:

- **sockets** cannot import from **app** or any other package (it's a leaf dependency)
- **app** can import from **sockets** only
- Future packages declare their allowed imports explicitly
- No importing private/internal files from other packages

## Strict Compiler Settings (tsconfig.base.json)

Applied to all packages via `extends`:

- `strict: true` (already enabled)
- `noUncheckedIndexedAccess: true` — forces null checks on index access
- `noImplicitReturns: true` — all code paths must return
- `noFallthroughCasesInSwitch: true`
- `forceConsistentCasingInFileNames: true`
- `verbatimModuleSyntax: true` — enforces `import type` for type-only imports
- `isolatedModules: true` — required for correct module boundaries
- `declaration: true` + `composite: true` — enables project references

## ESLint Rules for Boundary Enforcement

In addition to `eslint-plugin-boundaries`:

- `@typescript-eslint/consistent-type-imports` — enforces `import type` for type-only imports
- `@typescript-eslint/no-import-type-side-effects` — prevents side-effect type imports
- `no-restricted-imports` — block specific dangerous patterns (e.g., deep imports into node_modules)
- `complexity` + `max-lines-per-function` — already enabled, keep

## Socket Design Principles

The `@chatterbox/sockets` package defines:

1. **Interface types** — what each socket accepts and returns
2. **Default implementations** — current app behavior, so the app works unchanged
3. **No runtime dependencies** — pure TypeScript, no `ai` SDK, no React, no Node APIs

The sockets package defines its own minimal types for the data that crosses boundaries (e.g., `SocketMessage` instead of `UIMessage`). The app is responsible for converting between its internal types and socket types at the boundary. This keeps the sockets package completely decoupled from any specific SDK.

## Implementation Order

1. Create `packages/sockets/` with types and defaults (safe — new files only)
2. Move app files into `apps/web/` (structural move)
3. Create all config files (package.json, tsconfig, eslint)
4. Install deps and verify app runs
5. Install and configure boundary enforcement (eslint-plugin-boundaries)
6. Final verification — lint, typecheck, dev server
