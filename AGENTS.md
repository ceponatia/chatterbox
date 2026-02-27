# AGENTS.md — Repository Rules (`chatterbox`)

## Project purpose (end goal)

Chatterbox is a roleplay chat application focused on long-running continuity and reliable model behavior (GLM 5 via OpenRouter), with an architecture that supports iterative upgrades to prompt assembly, state management, and memory systems without destabilizing the app.

## Why this structure exists

This repo is intentionally organized as a strict monorepo so new systems can be built independently and integrated safely through contracts.

Goals:

- prevent architecture drift and hidden coupling
- enforce clear boundaries at compile/lint/package levels
- allow iterative replacement of prompt/state internals with minimal risk

## Workspace structure

```text
chatterbox/
├── apps/
│   └── web/                 # Next.js app runtime
├── packages/
│   └── sockets/             # boundary contracts + defaults
├── dev-docs/                # planning and implementation docs
├── prompts/                 # shared prompt assets
├── tsconfig.base.json       # strict shared TS settings
├── tsconfig.json            # project references hub
├── eslint.config.mjs        # root boundary rules
└── pnpm-workspace.yaml      # workspace package map
```

## Non-negotiable boundaries

### 1) Package boundaries (pnpm workspace)

- Every cross-package dependency must be declared explicitly.
- No implicit imports across package folders.

### 2) TypeScript project references

- Packages/apps are separate TS projects.
- Types flow through referenced projects, not arbitrary file imports.

### 3) Exports boundaries

- Packages expose public API via `exports`.
- Consumers import from package root only, never `src/*` internals.

### 4) ESLint boundaries

- Root ESLint enforces allowed dependency graph.
- Boundary violations are treated as architecture regressions.

## Import rules

Do:

- import package contracts from package root (`@chatterbox/sockets`)
- convert app-specific types at boundary adapters

Do not:

- deep import another package internals
- bypass workspace dependency declarations
- leak framework/SDK-specific types into shared contract packages

## AGENTS.md governance (required)

- Every package under `packages/*` and app under `apps/*` must include a package-scoped `AGENTS.md`.
- If a package/app is changed, its local `AGENTS.md` must be updated in the same PR.
- Package-level `AGENTS.md` updates must:
  - remove stale/redundant guidance,
  - capture any new or changed contracts, boundaries, commands, or integration notes,
  - stay consistent with root architecture rules in this file.

## Change policy for new systems

When introducing new architecture (prompt assembly, state pipeline, memory systems):

1. define a package-level contract first
2. add a default implementation that preserves behavior
3. integrate via explicit adapter in `apps/web`
4. enforce allowed import graph in ESLint boundaries

## Runtime/config expectations

- App runtime env lives at `apps/web/.env`.
- Root scripts orchestrate workspace commands (`pnpm dev`, `pnpm lint`, `pnpm typecheck`).

## Definition of done for structural changes

A structural PR is not complete unless all pass:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm dev` starts successfully
- no boundary/deep-import violations introduced
