---
source: tests/support/routed-modules.ts
sha256: f23e8b9a47f4265c537e8aa5426c7944bdab6bbcad346527573e39e3305dacfe
generated_at: 2026-11-08T09:58:46.026332+00:00
model: ollama:qwen3.8:27b
---

# tests/support/routed-modules.ts

## Purpose

Provides a pre-built map of every Express router mounted by an enabled module, so cross-cutting test files can iterate over all routers without hard-coding a list. It reads the module registry (`src/modules.ts`) at import time, meaning a newly enabled module is automatically included.

## Key elements

- **`ROUTED_MODULES: Record<string, Router>`** — Map of router key → Express `Router`. Keys are the module's directory name under `src/modules/`, optionally suffixed with `@<subpath>` for routers a module mounts under another resource's URL. Built by calling `routedModulesOf(enabledModules)`.
- **`routersOfModule(name: string): Router[]`** — Returns all routers whose key belongs to the given module name (i.e., the segment before any `@`). Returns an empty array if the module has no routers.

## Relationships

- **`src/modules.ts`** — Supplies `enabledModules`, the single source of truth for which modules are active. This file is a thin adapter over that registry.
- **`tests/support/routes.ts`** — Supplies the `routedModulesOf` helper used to build `ROUTED_MODULES`. This file is deliberately kept separate from `routes.ts` (see Notes).
- **`tests/cross-cutting/account-protection-routes.test.ts`**, **`authenticated-controllers.test.ts`**, **`write-routes-are-guarded.test.ts`** — Consumer tests that import `ROUTED_MODULES` or `routersOfModule` to drive assertions against every mounted router.

## Notes

- **Separation from `routes.ts` is intentional.** `routes.ts` contains mock factories (`cacheMock`, etc.) that are read back via `jest.requireActual('@tests/routes')` inside a `jest.mock` factory. Importing real routers into that same module would drag real middleware (`rate-limit`, `cache`, `upload`, `route-flag`) into the `requireActual` call mid-evaluation, causing each factory to resolve to `undefined`. Keeping this file separate ensures `requireActual('@tests/routes')` only touches pure helpers.
- **Consumers must still mock middleware first.** Any test that imports this file must declare its own `jest.mock` calls for the middleware factories *before* the import, exactly as if it imported the routers directly.
- **On-disk modules not in the registry** are not caught here; that gap is covered by `write-routes-are-guarded.test.ts`.
